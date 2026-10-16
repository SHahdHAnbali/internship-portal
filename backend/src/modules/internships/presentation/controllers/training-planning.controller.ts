import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';

import { TrainingPlanningService } from '../../application/services/training-planning.service.js';
import {
  MapTrainingRequestDto,
  UnmapTrainingRequestDto,
} from '../dto/training-planning.dto.js';

// HR training planning: demand, capacity and "Other" request mapping.
// Decisions about which applicants to select stay with HR.
@Controller('hr/training-planning')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('HR')
export class TrainingPlanningController {
  constructor(
    private readonly planning: TrainingPlanningService,
  ) {}

  @Get()
  async getPlan() {
    const [plan, recentChanges] = await Promise.all([
      this.planning.getPlan(),
      this.planning.getRecentEvents(),
    ]);
    return { ...plan, recentChanges };
  }

  @Put('requests/mapping')
  mapRequest(
    @Body() dto: MapTrainingRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.planning.mapRequest(actorId(request), dto.label, dto.internshipId, dto.note ?? null);
  }

  @Post('requests/unmap')
  unmapRequest(
    @Body() dto: UnmapTrainingRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.planning.unmapRequest(actorId(request), dto.label, dto.note ?? null);
  }
}

function actorId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
