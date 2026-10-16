import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { GetMyInternPlacementUseCase } from '../../application/use-cases/get-my-intern-placement.use-case.js';

@Controller('intern')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternPlacementController {
  constructor(
    private readonly getMyPlacement: GetMyInternPlacementUseCase,
  ) {}

  @Get('me/placement')
  getMe(@Req() request: AuthenticatedRequest) {
    const authUserId = request.authUser?.id;
    if (!authUserId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.getMyPlacement.execute(authUserId);
  }
}
