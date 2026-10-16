import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import type { UserRole } from '../../../../infrastructure/auth/user-role.type.js';
import { throwAdminError } from '../../domain/admin-errors.js';
import type { StaffRole } from '../../presentation/dto/admin-users.dto.js';

type OneOrMany<T> = T | T[] | null;

// Supabase Auth ban used while an account is deactivated (~100 years).
const DEACTIVATED_BAN_DURATION = '876000h';

export interface AdminUser {
  id: string;
  fullName: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  // From Supabase Auth; null when it could not be loaded.
  lastSignInAt: string | null;
}

export interface AdminAuditEvent {
  id: string;
  type: 'ADMIN_BOOTSTRAPPED' | 'USER_CREATED' | 'ROLE_CHANGED' | 'USER_DEACTIVATED' | 'USER_REACTIVATED' | 'SETTING_UPDATED';
  actorName: string | null;
  actorEmail: string | null;
  targetProfileId: string | null;
  // Null for portal setting changes (no account involved).
  targetEmail: string | null;
  details: Record<string, unknown>;
  note: string | null;
  createdAt: string;
}

export interface ListAdminUsersFilter {
  search?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
}

interface AuditEventRow {
  id: string;
  event_type: AdminAuditEvent['type'];
  target_profile_id: string | null;
  target_email: string | null;
  details: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: OneOrMany<{ full_name: string | null; email: string | null }>;
}

const PROFILE_COLUMNS = 'id, full_name, email, role, is_active, deactivated_at, created_at';

// System-level account management for ADMIN users. Every change goes through
// an audited database function that re-checks the acting administrator;
// Supabase Auth calls (create, ban) stay on the backend with the secret key.
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async listUsers(filter: ListAdminUsersFilter): Promise<{ users: AdminUser[]; total: number }> {
    let query = this.supabase.client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });
    if (filter.role) query = query.eq('role', filter.role);
    if (filter.status) query = query.eq('is_active', filter.status === 'active');

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException('Unable to load users');
    }

    const search = filter.search?.trim().toLowerCase();
    const rows = ((data ?? []) as ProfileRow[]).filter((row) =>
      !search
      || row.email.toLowerCase().includes(search)
      || (row.full_name ?? '').toLowerCase().includes(search));

    const lastSignIn = await this.loadLastSignIns();
    return {
      users: rows.map((row) => toAdminUser(row, lastSignIn.get(row.id) ?? null)),
      total: rows.length,
    };
  }

  async createStaffUser(
    actorProfileId: string,
    input: { email: string; fullName: string; role: StaffRole },
  ): Promise<AdminUser> {
    const auth = this.supabase.client.auth.admin;

    // Confirmed, password-less account: the person signs in with the
    // one-time email link on /login. No invitation email is sent here.
    const { data: created, error: createError } = await auth.createUser({
      email: input.email,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });

    if (createError || !created?.user) {
      if (isEmailExistsError(createError)) {
        throw new ConflictException('An account with this email already exists.');
      }
      this.logger.error(`Auth user creation failed: ${createError?.message ?? 'no user returned'}`);
      throw new InternalServerErrorException('Unable to create the sign-in account');
    }

    const userId = created.user.id;
    const { data, error } = await this.supabase.client.rpc('admin_create_staff_profile', {
      p_actor_profile_id: actorProfileId,
      p_user_id: userId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_role: input.role,
    });

    if (error) {
      // Never leave a sign-in account without a profile behind.
      const { error: cleanupError } = await auth.deleteUser(userId);
      if (cleanupError) {
        this.logger.error(`Cleanup of Auth user ${userId} failed after profile creation error: ${cleanupError.message}`);
      }
      throwAdminError(error);
    }

    return toAdminUser(singleProfile(data), null);
  }

  async changeRole(
    actorProfileId: string,
    targetProfileId: string,
    role: StaffRole,
    note: string | null,
  ): Promise<AdminUser> {
    const { data, error } = await this.supabase.client.rpc('admin_change_user_role', {
      p_actor_profile_id: actorProfileId,
      p_target_profile_id: targetProfileId,
      p_role: role,
      p_note: note,
    });
    if (error) throwAdminError(error);
    return toAdminUser(singleProfile(data), null);
  }

  // The database decides; the Auth ban then blocks new sign-ins and token
  // refreshes. The database call is idempotent, so a failed Auth step can be
  // retried by repeating the request.
  async setActive(
    actorProfileId: string,
    targetProfileId: string,
    active: boolean,
    note: string | null,
  ): Promise<{ user: AdminUser; signInBlockSynced: boolean }> {
    const { data, error } = await this.supabase.client.rpc('admin_set_user_active', {
      p_actor_profile_id: actorProfileId,
      p_target_profile_id: targetProfileId,
      p_active: active,
      p_note: note,
    });
    if (error) throwAdminError(error);
    const profile = singleProfile(data);

    const { error: banError } = await this.supabase.client.auth.admin.updateUserById(profile.id, {
      ban_duration: active ? 'none' : DEACTIVATED_BAN_DURATION,
    });
    if (banError) {
      this.logger.error(`Auth ban update failed for ${profile.id}: ${banError.message}`);
    }

    return { user: toAdminUser(profile, null), signInBlockSynced: !banError };
  }

  async listAuditEvents(options: { targetId?: string; limit?: number }): Promise<AdminAuditEvent[]> {
    let query = this.supabase.client
      .from('admin_audit_events')
      .select(`
        id,
        event_type,
        target_profile_id,
        target_email,
        details,
        note,
        created_at,
        actor:profiles!admin_audit_events_actor_profile_id_fkey ( full_name, email )
      `)
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 50);
    if (options.targetId) query = query.eq('target_profile_id', options.targetId);

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException('Unable to load the audit trail');
    }

    return ((data ?? []) as AuditEventRow[]).map((row) => {
      const actor = Array.isArray(row.actor) ? row.actor[0] ?? null : row.actor;
      return {
        id: row.id,
        type: row.event_type,
        actorName: actor?.full_name ?? null,
        actorEmail: actor?.email ?? null,
        targetProfileId: row.target_profile_id,
        targetEmail: row.target_email,
        details: row.details ?? {},
        note: row.note,
        createdAt: row.created_at,
      };
    });
  }

  // Best effort: the list still works when Auth metadata is unavailable.
  private async loadLastSignIns(): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    const { data, error } = await this.supabase.client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) {
      this.logger.warn('Unable to load sign-in activity from Supabase Auth');
      return result;
    }
    for (const user of data.users) {
      result.set(user.id, user.last_sign_in_at ?? null);
    }
    return result;
  }
}

function toAdminUser(row: ProfileRow, lastSignInAt: string | null): AdminUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    lastSignInAt,
  };
}

function singleProfile(data: unknown): ProfileRow {
  if (!Array.isArray(data) || data.length !== 1 || !isProfileRow(data[0])) {
    throw new InternalServerErrorException('Database operation returned an invalid result');
  }
  return data[0];
}

function isProfileRow(value: unknown): value is ProfileRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.email === 'string'
    && typeof row.role === 'string'
    && typeof row.is_active === 'boolean'
    && typeof row.created_at === 'string';
}

function isEmailExistsError(error: { code?: string; status?: number; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'email_exists'
    || error.code === 'user_already_exists'
    || (error.status === 422 && /already/i.test(error.message ?? ''));
}
