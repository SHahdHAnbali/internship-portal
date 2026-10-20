import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import {
  EvaluationBodyPipe,
  parseCreateEvaluationBody,
  parsePublishEvaluationBody,
  parseSaveEvaluationBody,
  type CreateEvaluationBody,
  type PublishEvaluationBody,
  type SaveEvaluationBody,
} from '../dto/evaluation-body.js';

// The currently assigned, active Mentor's evaluations. The Mentor is always
// the verified session's user; the database re-checks role, active status,
// assignment and placement state on every call. Saves and publishes need the
// expected revision and are never retried.
@Controller('mentor')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('MENTOR')
export class MentorEvaluationsController {
  constructor(private readonly evaluations: EvaluationRepository) {}

  @Get('placements/:placementId/evaluations')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.listForMentorPlacement(userId(request), placementId);
  }

  @Post('placements/:placementId/evaluations')
  @Header('Cache-Control', 'no-store')
  create(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body(new EvaluationBodyPipe(parseCreateEvaluationBody)) body: CreateEvaluationBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.createForMentor(userId(request), placementId, body.clientRequestId, body.content);
  }

  @Get('evaluations/:evaluationId')
  @Header('Cache-Control', 'no-store')
  get(
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.getForMentor(userId(request), evaluationId);
  }

  @Put('evaluations/:evaluationId')
  @Header('Cache-Control', 'no-store')
  save(
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Body(new EvaluationBodyPipe(parseSaveEvaluationBody)) body: SaveEvaluationBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.saveForMentor(userId(request), evaluationId, body.expectedRevision, body.content);
  }

  // Publishes the saved text of the expected revision (never client text).
  @Post('evaluations/:evaluationId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  publish(
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Body(new EvaluationBodyPipe(parsePublishEvaluationBody)) body: PublishEvaluationBody,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.evaluations.publishForMentor(userId(request), evaluationId, body.expectedRevision);
  }
}

function userId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}
