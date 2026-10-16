import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

@Injectable()
export class UnassignInternPlacementMentorUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(
    actorProfileId: string,
    placementId: string,
    note: string | null,
  ): Promise<InternPlacementResponse> {
    return this.placements.unassignMentor(actorProfileId, placementId, note);
  }
}
