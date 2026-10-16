import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { SupabaseAuthGuard, type AuthenticatedRequest } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';

import { GetApplicantProfileUseCase } from '../../application/use-cases/get-applicant-profile.use-case.js';

// An intern keeps read access to the profile and application history they
// submitted as an applicant (their own data only; changes go through HR).
@Controller('intern')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternProfileController {
  constructor(
    private readonly getApplicantProfileUseCase: GetApplicantProfileUseCase,
  ) {}

  @Get('me/profile')
  getMe(@Req() request: AuthenticatedRequest) {
    const authUserId = request.authUser?.id;
    if (!authUserId) throw new UnauthorizedException('Authentication required');
    return this.getApplicantProfileUseCase.execute(authUserId);
  }
}
