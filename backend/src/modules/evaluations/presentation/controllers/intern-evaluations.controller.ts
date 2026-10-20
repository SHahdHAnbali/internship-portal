import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { EvaluationRepository } from '../../domain/repositories/evaluation.repository.js';

// The intern's published evaluations (snapshots only) across their own ACTIVE
// and COMPLETED placements. The intern is always the verified session's user;
// ownership is re-checked in the database.
@Controller('intern/me/evaluations')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternEvaluationsController {
  constructor(private readonly evaluations: EvaluationRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest) {
    return this.evaluations.listForIntern(userId(request));
  }

  @Get(':evaluationId')
  @Header('Cache-Control', 'no-store')
  get(
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.getForIntern(userId(request), evaluationId);
  }
}

function userId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}
