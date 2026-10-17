import {
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { SupabaseAuthGuard, type AuthenticatedRequest } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
import { AllowPendingPasswordSetup } from '../../../../infrastructure/auth/password-setup.js';
import { PasswordSetupService } from '../../application/services/password-setup.service.js';

// The signed-in person's own account. Every portal role may use it; the
// profile is always the verified session's, never one named in the request.
@Controller('account')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('APPLICANT', 'INTERN', 'MENTOR', 'HR', 'ADMIN')
export class AccountController {
  constructor(private readonly passwordSetup: PasswordSetupService) {}

  // Must stay reachable while setup is pending: it is how setup completes.
  @Post('password-setup')
  @AllowPendingPasswordSetup()
  @HttpCode(200)
  markPasswordSet(@Req() request: AuthenticatedRequest) {
    const profileId = request.authUser?.id;
    if (!profileId) throw new UnauthorizedException('Authentication required');
    return this.passwordSetup.markPasswordSet(profileId);
  }
}
