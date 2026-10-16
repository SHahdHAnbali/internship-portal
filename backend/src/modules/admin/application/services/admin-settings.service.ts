import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwAdminError } from '../../domain/admin-errors.js';

type OneOrMany<T> = T | T[] | null;

export interface ApplicationIntakeSetting {
  applicationsOpen: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

// Portal-wide application intake (ADMIN). Closing it stops new applications
// and the finalizing of pending reviews; HR work is unaffected.
@Injectable()
export class AdminSettingsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getApplicationIntake(): Promise<ApplicationIntakeSetting> {
    const { data, error } = await this.supabase.client
      .from('portal_settings')
      .select('applications_open, updated_at, updater:profiles!portal_settings_updated_by_fkey ( full_name, email )')
      .maybeSingle();
    if (error || !data) {
      throw new InternalServerErrorException('Unable to load the application intake setting');
    }
    const row = data as {
      applications_open: boolean;
      updated_at: string;
      updater: OneOrMany<{ full_name: string | null; email: string | null }>;
    };
    const updater = Array.isArray(row.updater) ? row.updater[0] ?? null : row.updater;
    return {
      applicationsOpen: row.applications_open,
      updatedAt: row.updated_at,
      updatedBy: updater?.full_name ?? updater?.email ?? null,
    };
  }

  async setApplicationIntake(actorProfileId: string, open: boolean, note: string | null): Promise<ApplicationIntakeSetting> {
    const { error } = await this.supabase.client.rpc('admin_set_application_intake', {
      p_actor_profile_id: actorProfileId,
      p_open: open,
      p_note: note,
    });
    if (error) {
      throwAdminError(error);
    }
    return this.getApplicationIntake();
  }
}
