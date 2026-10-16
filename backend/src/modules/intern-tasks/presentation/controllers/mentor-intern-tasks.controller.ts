import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreateMentorInternTaskUseCase } from '../../application/use-cases/create-mentor-intern-task.use-case.js';
import { ListMentorPlacementTasksUseCase } from '../../application/use-cases/list-mentor-placement-tasks.use-case.js';
import { ListMyMentorPlacementsUseCase } from '../../application/use-cases/list-my-mentor-placements.use-case.js';
import { MentorTasksService } from '../../application/services/mentor-tasks.service.js';
import { CreateInternTaskDto, UpdateInternTaskDto } from '../dto/create-intern-task.dto.js';
import { CancelInternTaskDto, ReviewInternTaskDto } from '../dto/mentor-task-actions.dto.js';

@Controller('mentor')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('MENTOR')
export class MentorInternTasksController {
  constructor(
    private readonly listPlacements: ListMyMentorPlacementsUseCase,
    private readonly listTasks: ListMentorPlacementTasksUseCase,
    private readonly createTask: CreateMentorInternTaskUseCase,
    private readonly mentorTasks: MentorTasksService,
  ) {}

  @Get('placements')
  listPlacementsForMentor(@Req() request: AuthenticatedRequest) {
    const mentorProfileId = request.authUser?.id;
    if (!mentorProfileId) throw new UnauthorizedException('Authentication required');
    return this.listPlacements.execute(mentorProfileId);
  }

  @Get('placements/:placementId/tasks')
  listPlacementTasks(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const mentorProfileId = request.authUser?.id;
    if (!mentorProfileId) throw new UnauthorizedException('Authentication required');
    return this.listTasks.execute(mentorProfileId, placementId);
  }

  @Post('placements/:placementId/tasks')
  createPlacementTask(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Body() dto: CreateInternTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const mentorProfileId = request.authUser?.id;
    if (!mentorProfileId) throw new UnauthorizedException('Authentication required');
    return this.createTask.execute({
      mentorProfileId,
      placementId,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      priority: dto.priority,
    });
  }

  @Get('placements/:placementId/task-events')
  listTaskEvents(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mentorTasks.listEvents(mentorId(request), placementId);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateInternTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mentorTasks.update(mentorId(request), taskId, {
      title: dto.title,
      description: dto.description || null,
      dueDate: dto.dueDate || null,
      priority: dto.priority,
    });
  }

  @Post('tasks/:taskId/cancel')
  cancelTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CancelInternTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mentorTasks.cancel(mentorId(request), taskId, dto.reason);
  }

  @Post('tasks/:taskId/review')
  reviewTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ReviewInternTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mentorTasks.review(mentorId(request), taskId, dto.decision, dto.feedback ?? null);
  }
}

function mentorId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}
