import { Injectable } from '@nestjs/common';

import { MentorPlacementRepository } from '../../domain/repositories/mentor-placement.repository.js';

@Injectable()
export class ListMyMentorPlacementsUseCase {
  constructor(private readonly placements: MentorPlacementRepository) {}

  execute(mentorProfileId: string) {
    return this.placements.listForMentor(mentorProfileId);
  }
}
