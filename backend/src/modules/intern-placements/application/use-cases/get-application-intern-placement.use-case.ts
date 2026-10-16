import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type ApplicationPlacementOverview,
} from '../../domain/repositories/intern-placement.repository.js';

// Current placement, cancelled placements, seats and history for one
// submitted application (HR view).
@Injectable()
export class GetApplicationInternPlacementUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(applicationId: string): Promise<ApplicationPlacementOverview> {
    return this.placements.getOverviewForApplication(applicationId);
  }
}
