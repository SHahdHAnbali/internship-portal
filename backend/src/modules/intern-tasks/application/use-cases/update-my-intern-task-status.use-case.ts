import { BadRequestException, Injectable } from '@nestjs/common';

import {
  InternTaskRepository,
  type InternTaskResponse,
} from '../../domain/repositories/intern-task.repository.js';

@Injectable()
export class UpdateMyInternTaskStatusUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(
    authUserId: string,
    taskId: string,
    status: string,
    note: string | null = null,
  ): Promise<InternTaskResponse> {
    if (status !== 'IN_PROGRESS' && status !== 'COMPLETED') {
      throw new BadRequestException('Task status is invalid');
    }
    return this.tasks.updateStatus(authUserId, taskId, status, note);
  }
}
