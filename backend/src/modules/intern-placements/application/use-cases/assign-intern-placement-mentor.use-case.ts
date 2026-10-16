import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

@Injectable()
export class AssignInternPlacementMentorUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(
    actorProfileId: string,
    placementId: string,
    mentorProfileId: string,
  ): Promise<InternPlacementResponse> {
    return this.placements.assignMentor(actorProfileId, placementId, mentorProfileId);
  }
}
