import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
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
import { ListMyInternTasksUseCase } from '../../application/use-cases/list-my-intern-tasks.use-case.js';
import { UpdateMyInternTaskStatusUseCase } from '../../application/use-cases/update-my-intern-task-status.use-case.js';
import { UpdateInternTaskStatusDto } from '../dto/update-intern-task-status.dto.js';
import { WithdrawMyInternTaskSubmissionUseCase } from '../../application/use-cases/withdraw-my-intern-task-submission.use-case.js';

@Controller('intern/me/tasks')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternTasksController {
  constructor(
    private readonly listTasks: ListMyInternTasksUseCase,
    private readonly updateTaskStatus: UpdateMyInternTaskStatusUseCase,
    private readonly withdrawSubmission: WithdrawMyInternTaskSubmissionUseCase,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    const authUserId = request.authUser?.id;
    if (!authUserId) throw new UnauthorizedException('Authentication required');
    return this.listTasks.execute(authUserId);
  }

  @Patch(':taskId/status')
  updateStatus(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateInternTaskStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.authUser?.id;
    if (!authUserId) throw new UnauthorizedException('Authentication required');
    return this.updateTaskStatus.execute(authUserId, taskId, dto.status, dto.note ?? null);
  }

  // Takes back a submission awaiting review (before the end of the due day).
  // No body: identity, state and time all come from the server.
  @Post(':taskId/withdraw')
  withdraw(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.authUser?.id;
    if (!authUserId) throw new UnauthorizedException('Authentication required');
    return this.withdrawSubmission.execute(authUserId, taskId);
  }
}
