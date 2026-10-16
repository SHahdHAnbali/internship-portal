import {
  Body,
  Controller,
  Get,
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
import { ActivateInternPlacementUseCase } from '../../application/use-cases/activate-intern-placement.use-case.js';
import { CreateInternPlacementUseCase } from '../../application/use-cases/create-intern-placement.use-case.js';
import { GetApplicationInternPlacementUseCase } from '../../application/use-cases/get-application-intern-placement.use-case.js';
import { AssignInternPlacementMentorUseCase } from '../../application/use-cases/assign-intern-placement-mentor.use-case.js';
import { CancelInternPlacementUseCase } from '../../application/use-cases/cancel-intern-placement.use-case.js';
import { CancelInternPlacementDto } from '../dto/cancel-intern-placement.dto.js';
import { CompleteInternPlacementUseCase } from '../../application/use-cases/complete-intern-placement.use-case.js';
import { CompleteInternPlacementDto } from '../dto/complete-intern-placement.dto.js';
import { ListHrMentorsUseCase } from '../../application/use-cases/list-hr-mentors.use-case.js';
import { UnassignInternPlacementMentorUseCase } from '../../application/use-cases/unassign-intern-placement-mentor.use-case.js';
import { UnassignInternPlacementMentorDto } from '../dto/unassign-intern-placement-mentor.dto.js';
import { AssignInternPlacementMentorDto } from '../dto/assign-intern-placement-mentor.dto.js';
import { CreateInternPlacementDto } from '../dto/create-intern-placement.dto.js';

@Controller('hr')
export class HrInternPlacementsController {
  constructor(
    private readonly createPlacement: CreateInternPlacementUseCase,
    private readonly activatePlacement: ActivateInternPlacementUseCase,
    private readonly cancelPlacement: CancelInternPlacementUseCase,
    private readonly getApplicationPlacement: GetApplicationInternPlacementUseCase,
    private readonly listMentors: ListHrMentorsUseCase,
    private readonly assignMentor: AssignInternPlacementMentorUseCase,
    private readonly unassignMentor: UnassignInternPlacementMentorUseCase,
    private readonly completePlacement: CompleteInternPlacementUseCase,
  ) {}

  @Get('applications/:applicationId/placement')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getForApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.authUser?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.getApplicationPlacement.execute(applicationId);
  }

  @Post('applications/:applicationId/placements')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateInternPlacementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.createPlacement.execute({
      actorProfileId,
      applicationId,
      company: dto.company,
      department: dto.department,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });
  }

  @Post('placements/:placementId/activate')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  activate(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.activatePlacement.execute(actorProfileId, placementId);
  }

  @Post('placements/:placementId/cancel')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  cancel(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body() dto: CancelInternPlacementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.cancelPlacement.execute(actorProfileId, placementId, dto.reason);
  }

  @Post('placements/:placementId/complete')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  complete(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body() dto: CompleteInternPlacementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) throw new UnauthorizedException('Authentication required');
    return this.completePlacement.execute(actorProfileId, placementId, dto.note ?? null);
  }

  @Get('mentors')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getMentors(@Req() request: AuthenticatedRequest) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) throw new UnauthorizedException('Authentication required');
    return this.listMentors.execute(actorProfileId);
  }

  @Put('placements/:placementId/mentor')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  assignPlacementMentor(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body() dto: AssignInternPlacementMentorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) throw new UnauthorizedException('Authentication required');
    return this.assignMentor.execute(actorProfileId, placementId, dto.mentorProfileId);
  }

  @Post('placements/:placementId/mentor/unassign')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  unassignPlacementMentor(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body() dto: UnassignInternPlacementMentorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) throw new UnauthorizedException('Authentication required');
    return this.unassignMentor.execute(actorProfileId, placementId, dto.note ?? null);
  }
}
