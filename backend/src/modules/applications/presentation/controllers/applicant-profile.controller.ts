import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { SupabaseAuthGuard, type AuthenticatedRequest } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';

import { GetApplicantProfileUseCase } from '../../application/use-cases/get-applicant-profile.use-case.js';
import { UpdateApplicantProfileUseCase } from '../../application/use-cases/update-applicant-profile.use-case.js';
import { UpdateApplicantProfileDto } from '../dto/update-applicant-profile.dto.js';

// The signed-in applicant's own data only; identity always comes from the
// verified session, never from the request.
@Controller('applicant')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('APPLICANT')
export class ApplicantProfileController {
  constructor(
    private readonly getApplicantProfileUseCase: GetApplicantProfileUseCase,
    private readonly updateApplicantProfileUseCase: UpdateApplicantProfileUseCase,
  ) {}

  @Get('me')
  getMe(@Req() request: AuthenticatedRequest) {
    return this.getApplicantProfileUseCase.execute(authUserId(request));
  }

  @Patch('me')
  updateMe(
    @Body() dto: UpdateApplicantProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.updateApplicantProfileUseCase.execute(authUserId(request), dto);
  }
}

function authUserId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
