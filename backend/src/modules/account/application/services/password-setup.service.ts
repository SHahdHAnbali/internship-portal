import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';

// Records that the signed-in person has set a password with Supabase Auth.
// The password itself never reaches the backend; the flag only routes the
// person past the Set Password page and is never used for authorization.
@Injectable()
export class PasswordSetupService {
  constructor(private readonly supabase: SupabaseService) {}

  async markPasswordSet(profileId: string): Promise<{ passwordSetAt: string }> {
    const { data, error } = await this.supabase.client.rpc('mark_my_password_set', {
      p_profile_id: profileId,
    });
    if (error) throwSupabaseRpcHttpException(error);
    if (typeof data !== 'string') {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }
    return { passwordSetAt: data };
  }
}
