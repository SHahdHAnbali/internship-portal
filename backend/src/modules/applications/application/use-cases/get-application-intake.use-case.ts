import { Injectable } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { isApplicationIntakeOpen } from '../../infrastructure/intake/application-intake.js';

// Public: whether the portal currently accepts applications (ADMIN setting).
@Injectable()
export class GetApplicationIntakeUseCase {
  constructor(private readonly supabase: SupabaseService) {}

  async execute(): Promise<{ applicationsOpen: boolean }> {
    return { applicationsOpen: await isApplicationIntakeOpen(this.supabase) };
  }
}
