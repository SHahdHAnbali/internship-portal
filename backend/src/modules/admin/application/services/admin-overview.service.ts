import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import type { UserRole } from '../../../../infrastructure/auth/user-role.type.js';
import { ALL_ROLES } from '../../presentation/dto/admin-users.dto.js';

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, { active: number; inactive: number }>;
  };
  // Deployment configuration as booleans/labels only; values and keys are
  // never returned. Changing them requires a redeploy, so this is read-only.
  system: {
    environment: string;
    frontendUrl: string;
    databaseConfigured: boolean;
    emailDeliveryConfigured: boolean;
    // A verified-domain sender (EMAIL_FROM); otherwise only the Resend owner receives emails.
    emailSenderConfigured: boolean;
    reviewEmailRedirectActive: boolean;
    cvExtractionConfigured: boolean;
  };
}

@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async getOverview(): Promise<AdminOverview> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('role, is_active');
    if (error) {
      throw new InternalServerErrorException('Unable to load users');
    }

    const byRole = Object.fromEntries(
      ALL_ROLES.map((role) => [role, { active: 0, inactive: 0 }]),
    ) as AdminOverview['users']['byRole'];
    let active = 0;
    let inactive = 0;
    for (const row of (data ?? []) as { role: UserRole; is_active: boolean }[]) {
      const bucket = byRole[row.role];
      if (row.is_active) {
        active += 1;
        if (bucket) bucket.active += 1;
      } else {
        inactive += 1;
        if (bucket) bucket.inactive += 1;
      }
    }

    const environment = this.config.get<string>('email.nodeEnv') ?? 'not set';
    return {
      users: { total: active + inactive, active, inactive, byRole },
      system: {
        environment,
        frontendUrl: this.config.get<string>('email.frontendUrl') ?? 'http://localhost:5173',
        databaseConfigured: Boolean(this.config.get<string>('database.supabaseUrl'))
          && Boolean(this.config.get<string>('database.supabaseSecretKey')),
        emailDeliveryConfigured: Boolean(this.config.get<string>('email.resendApiKey')),
        emailSenderConfigured: Boolean(this.config.get<string>('email.from')?.trim()),
        // Mirrors the email service: the redirect only applies in development/test.
        reviewEmailRedirectActive: Boolean(this.config.get<string>('email.applicationReviewEmailOverride')?.trim())
          && (environment === 'development' || environment === 'test'),
        cvExtractionConfigured: Boolean(this.config.get<string>('ai.openRouterApiKey')),
      },
    };
  }
}
