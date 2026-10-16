import { Injectable } from '@nestjs/common';

import { InternshipRepository } from '../../domain/repositories/internship.repository.js';

@Injectable()
export class ListInternshipsUseCase {
  constructor(
    private readonly internshipRepository:
      InternshipRepository,
  ) {}

  // Public: listed training types only.
  execute() {
    return this.internshipRepository.findListed();
  }

  // HR: every type with listing, approval and capacity.
  executeForHr() {
    return this.internshipRepository.findAllForHr();
  }
}