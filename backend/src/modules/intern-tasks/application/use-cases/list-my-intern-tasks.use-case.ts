import { Injectable } from '@nestjs/common';

import { InternTaskRepository } from '../../domain/repositories/intern-task.repository.js';

@Injectable()
export class ListMyInternTasksUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(authUserId: string) {
    return this.tasks.listForIntern(authUserId);
  }
}
