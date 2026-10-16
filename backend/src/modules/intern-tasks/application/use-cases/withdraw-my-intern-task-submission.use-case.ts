import { Injectable } from '@nestjs/common';

import {
  InternTaskRepository,
  type InternTaskResponse,
} from '../../domain/repositories/intern-task.repository.js';

// The intern takes back a submission that awaits review, before the end of the
// due day (Asia/Hebron). The database checks ownership, state and deadline
// with its own clock; nothing from the client is trusted.
@Injectable()
export class WithdrawMyInternTaskSubmissionUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(authUserId: string, taskId: string): Promise<InternTaskResponse> {
    return this.tasks.withdrawSubmission(authUserId, taskId);
  }
}
