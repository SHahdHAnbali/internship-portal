import { Injectable } from '@nestjs/common';

import {
  InternPlacementRepository,
  type MyInternPlacementResponse,
} from '../../domain/repositories/intern-placement.repository.js';

@Injectable()
export class GetMyInternPlacementUseCase {
  constructor(
    private readonly placements: InternPlacementRepository,
  ) {}

  execute(authUserId: string): Promise<MyInternPlacementResponse> {
    return this.placements.getActiveForAuthUser(authUserId);
  }
}
