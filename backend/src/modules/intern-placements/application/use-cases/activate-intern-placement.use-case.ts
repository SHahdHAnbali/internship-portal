import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type InternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

@Injectable()
export class ActivateInternPlacementUseCase {
  constructor(
    private readonly placements: InternPlacementRepository,
  ) {}

  execute(
    actorProfileId: string,
    placementId: string,
  ): Promise<InternPlacementResponse> {
    return this.placements.activate(actorProfileId, placementId);
  }
}
