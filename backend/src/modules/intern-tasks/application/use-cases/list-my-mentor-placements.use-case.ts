import { Injectable } from '@nestjs/common';

import { InternTaskRepository } from '../../domain/repositories/intern-task.repository.js';

@Injectable()
export class ListMyMentorPlacementsUseCase {
  constructor(private readonly tasks: InternTaskRepository) {}

  execute(mentorProfileId: string) {
    return this.tasks.listForMentor(mentorProfileId);
  }
}
