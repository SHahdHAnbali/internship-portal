import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

// Cancels a placement that has not started (SCHEDULED). The application stays
// SELECTED so HR can create a replacement placement.
@Injectable()
export class CancelInternPlacementUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(actorProfileId: string, placementId: string, reason: string): Promise<InternPlacementResponse> {
    return this.placements.cancel(actorProfileId, placementId, reason);
  }
}
