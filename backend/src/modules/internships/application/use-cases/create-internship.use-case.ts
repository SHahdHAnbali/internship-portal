import { Injectable } from '@nestjs/common';

import {
  InternshipRepository,
  type CreateInternshipInput,
} from '../../domain/repositories/internship.repository.js';

@Injectable()
export class CreateInternshipUseCase {
  constructor(
    private readonly internshipRepository: InternshipRepository,
  ) {}

  execute(command: CreateInternshipInput) {
    return this.internshipRepository.create(command);
  }
}
