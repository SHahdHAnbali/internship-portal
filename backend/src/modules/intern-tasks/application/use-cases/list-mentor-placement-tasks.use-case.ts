import { Injectable } from '@nestjs/common';

import { InternTaskRepository } from '../../domain/repositories/intern-task.repository.js';

@Injectable()
export class ListMentorPlacementTasksUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(mentorProfileId: string, placementId: string) {
    return this.tasks.listForMentorPlacement(mentorProfileId, placementId);
  }
}
