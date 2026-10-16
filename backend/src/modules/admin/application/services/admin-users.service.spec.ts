import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

import type { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminOverviewService } from './admin-overview.service.js';
import type { ConfigService } from '@nestjs/config';

const PROFILE = {
  id: 'new-user-id',
  full_name: 'Maya Mentor',
  email: 'maya@example.com',
  role: 'MENTOR',
  is_active: true,
  deactivated_at: null,
  created_at: '2026-10-11T10:00:00Z',
};

function authAdmin(overrides: Record<string, unknown> = {}) {
  return {
    createUser: vi.fn(async () => ({ data: { user: { id: 'new-user-id' } }, error: null })),
    deleteUser: vi.fn(async () => ({ data: {}, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    listUsers: vi.fn(async () => ({
      data: { users: [{ id: 'u1', last_sign_in_at: '2026-10-10T08:00:00Z' }] },
      error: null,
    })),
    ...overrides,
  };
}

function supabaseStub(options: {
  admin?: ReturnType<typeof authAdmin>;
  rpc?: ReturnType<typeof vi.fn>;
  rows?: unknown[];
} = {}) {
  const admin = options.admin ?? authAdmin();
  const rpc = options.rpc ?? vi.fn(async () => ({ data: [PROFILE], error: null }));
  const filters: [string, unknown][] = [];
  // A real promise with the chainable builder methods: awaiting the builder
  // resolves the rows, as with PostgREST.
  const query = Object.assign(Promise.resolve({ data: options.rows ?? [], error: null }), {
    select: () => query,
    order: () => query,
    limit: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
  });
  const supabase = {
    client: { auth: { admin }, rpc, from: vi.fn(() => query) },
  } as unknown as SupabaseService;
  return { supabase, admin, rpc, filters };
}

describe('AdminUsersService', () => {
  describe('createStaffUser', () => {
    const input = { email: 'maya@example.com', fullName: 'Maya Mentor', role: 'MENTOR' as const };

    it('creates a confirmed password-less sign-in account, then the audited profile', async () => {
      const { supabase, admin, rpc } = supabaseStub();
      const user = await new AdminUsersService(supabase).createStaffUser('admin-id', input);

      expect(admin.createUser).toHaveBeenCalledWith({
        email: 'maya@example.com',
        email_confirm: true,
        user_metadata: { full_name: 'Maya Mentor' },
      });
      expect(rpc).toHaveBeenCalledWith('admin_create_staff_profile', {
        p_actor_profile_id: 'admin-id',
        p_user_id: 'new-user-id',
        p_email: 'maya@example.com',
        p_full_name: 'Maya Mentor',
        p_role: 'MENTOR',
      });
      expect(user).toMatchObject({ id: 'new-user-id', role: 'MENTOR', isActive: true });
      expect(admin.deleteUser).not.toHaveBeenCalled();
    });

    it('reports an existing email as a conflict without creating a profile', async () => {
      const admin = authAdmin({
        createUser: vi.fn(async () => ({ data: { user: null }, error: { code: 'email_exists', status: 422, message: 'exists' } })),
      });
      const { supabase, rpc } = supabaseStub({ admin });
      await expect(new AdminUsersService(supabase).createStaffUser('admin-id', input))
        .rejects.toBeInstanceOf(ConflictException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('removes the new sign-in account when the profile cannot be created', async () => {
      const rpc = vi.fn(async () => ({ data: null, error: { code: 'PZ403', message: 'admin_role_required' } }));
      const { supabase, admin } = supabaseStub({ rpc });
      await expect(new AdminUsersService(supabase).createStaffUser('admin-id', input))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(admin.deleteUser).toHaveBeenCalledWith('new-user-id');
    });

    it('does not expose Auth error text', async () => {
      const admin = authAdmin({
        createUser: vi.fn(async () => ({ data: { user: null }, error: { status: 500, message: 'internal secret detail' } })),
      });
      const { supabase } = supabaseStub({ admin });
      const error = await new AdminUsersService(supabase).createStaffUser('admin-id', input).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(String((error as Error).message)).not.toContain('secret');
    });
  });

  describe('setActive', () => {
    it('bans a deactivated account in Auth after the database change', async () => {
      const rpc = vi.fn(async () => ({ data: [{ ...PROFILE, is_active: false, deactivated_at: 't' }], error: null }));
      const { supabase, admin } = supabaseStub({ rpc });
      const result = await new AdminUsersService(supabase).setActive('admin-id', 'new-user-id', false, 'Left');

      expect(rpc).toHaveBeenCalledWith('admin_set_user_active', {
        p_actor_profile_id: 'admin-id', p_target_profile_id: 'new-user-id', p_active: false, p_note: 'Left',
      });
      expect(admin.updateUserById).toHaveBeenCalledWith('new-user-id', { ban_duration: '876000h' });
      expect(result).toMatchObject({ signInBlockSynced: true, user: { isActive: false } });
    });

    it('lifts the ban on reactivation', async () => {
      const { supabase, admin } = supabaseStub();
      await new AdminUsersService(supabase).setActive('admin-id', 'new-user-id', true, null);
      expect(admin.updateUserById).toHaveBeenCalledWith('new-user-id', { ban_duration: 'none' });
    });

    it('reports when the Auth ban could not be synced (the request can be retried)', async () => {
      const admin = authAdmin({ updateUserById: vi.fn(async () => ({ data: null, error: { message: 'down' } })) });
      const { supabase } = supabaseStub({ admin });
      const result = await new AdminUsersService(supabase).setActive('admin-id', 'new-user-id', true, null);
      expect(result.signInBlockSynced).toBe(false);
    });

    it('never touches Auth when the database refuses (e.g. last admin)', async () => {
      const rpc = vi.fn(async () => ({ data: null, error: { code: 'PZ409', message: 'last_admin' } }));
      const { supabase, admin } = supabaseStub({ rpc });
      await expect(new AdminUsersService(supabase).setActive('admin-id', 'x', false, 'r'))
        .rejects.toThrow('At least one active administrator must remain.');
      expect(admin.updateUserById).not.toHaveBeenCalled();
    });
  });

  it('maps role-change refusals to clear messages', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PZ409', message: 'mentor_has_open_placements' } }));
    const { supabase } = supabaseStub({ rpc });
    await expect(new AdminUsersService(supabase).changeRole('admin-id', 'x', 'HR', null))
      .rejects.toThrow('This Mentor still supervises scheduled or active placements. HR must reassign them first.');
  });

  describe('listUsers', () => {
    const rows = [
      { ...PROFILE, id: 'u1', full_name: 'Maya Mentor', email: 'maya@example.com' },
      { ...PROFILE, id: 'u2', full_name: 'Omar', email: 'omar@example.com', role: 'HR' },
    ];

    it('filters by role/status in the database and searches name or email', async () => {
      const { supabase, filters } = supabaseStub({ rows });
      const result = await new AdminUsersService(supabase).listUsers({ role: 'MENTOR', status: 'inactive', search: 'MAYA' });
      expect(filters).toEqual([['role', 'MENTOR'], ['is_active', false]]);
      expect(result.total).toBe(1);
      expect(result.users[0]).toMatchObject({ id: 'u1', lastSignInAt: '2026-10-10T08:00:00Z' });
    });

    it('still lists users when Auth activity cannot be loaded', async () => {
      const admin = authAdmin({ listUsers: vi.fn(async () => ({ data: null, error: { message: 'down' } })) });
      const { supabase } = supabaseStub({ rows, admin });
      const result = await new AdminUsersService(supabase).listUsers({});
      expect(result.users.map((user) => user.lastSignInAt)).toEqual([null, null]);
    });
  });
});

describe('AdminOverviewService', () => {
  const config = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  it('counts users per role and status and reports configuration without values', async () => {
    const { supabase } = supabaseStub({
      rows: [
        { role: 'HR', is_active: true },
        { role: 'MENTOR', is_active: false },
        { role: 'APPLICANT', is_active: true },
      ],
    });
    const overview = await new AdminOverviewService(supabase, config({
      'email.nodeEnv': 'development',
      'email.resendApiKey': 're_secret_value',
      'email.applicationReviewEmailOverride': 'dev@example.com',
      'database.supabaseUrl': 'https://x.supabase.co',
      'database.supabaseSecretKey': 'sb_secret_value',
    })).getOverview();

    expect(overview.users).toMatchObject({ total: 3, active: 2, inactive: 1 });
    expect(overview.users.byRole.MENTOR).toEqual({ active: 0, inactive: 1 });
    expect(overview.system).toMatchObject({
      environment: 'development',
      databaseConfigured: true,
      emailDeliveryConfigured: true,
      emailSenderConfigured: false,
      reviewEmailRedirectActive: true,
      cvExtractionConfigured: false,
    });
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain('secret_value');
    expect(serialized).not.toContain('dev@example.com');
  });

  it('never reports the review-email redirect as active outside development/test', async () => {
    const { supabase } = supabaseStub();
    const overview = await new AdminOverviewService(supabase, config({
      'email.nodeEnv': 'production',
      'email.applicationReviewEmailOverride': 'dev@example.com',
    })).getOverview();
    expect(overview.system.reviewEmailRedirectActive).toBe(false);
  });
});
