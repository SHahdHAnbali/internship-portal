import { Injectable } from '@nestjs/common';

import { InternPlacementRepository } from '../../domain/repositories/intern-placement.repository.js';

@Injectable()
export class ListHrMentorsUseCase {
  constructor(private readonly placements: InternPlacementRepository) {}

  execute(actorProfileId: string) {
    return this.placements.listMentors(actorProfileId);
  }
}
