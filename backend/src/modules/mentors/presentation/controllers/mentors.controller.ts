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
import { ListMyMentorPlacementsUseCase } from '../../application/use-cases/list-my-mentor-placements.use-case.js';

@Controller('mentor')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('MENTOR')
export class MentorPlacementsController {
  constructor(private readonly listPlacements: ListMyMentorPlacementsUseCase) {}

  // Placements assigned to the signed-in Mentor (identity from the session only).
  @Get('placements')
  list(@Req() request: AuthenticatedRequest) {
    const mentorProfileId = request.authUser?.id;
    if (!mentorProfileId) throw new UnauthorizedException('Authentication required');
    return this.listPlacements.execute(mentorProfileId);
  }
}
