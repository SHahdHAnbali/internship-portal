import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

// HR completes an ACTIVE placement (early end needs a reason). The database
// refuses while weekly reports await review (and, until the task retirement
// migration, while legacy tasks are open); the intern keeps the INTERN role
// with read-only access.
@Injectable()
export class CompleteInternPlacementUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(actorProfileId: string, placementId: string, note: string | null): Promise<InternPlacementResponse> {
    return this.placements.complete(actorProfileId, placementId, note);
  }
}
