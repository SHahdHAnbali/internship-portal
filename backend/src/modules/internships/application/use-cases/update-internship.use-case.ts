import { Injectable } from '@nestjs/common';

import {
  InternshipRepository,
  type UpdateInternshipInput,
} from '../../domain/repositories/internship.repository.js';

// Rename, open/close for applications, or revise capacity. The database
// refuses a capacity below the seats already taken and records the change.
@Injectable()
export class UpdateInternshipUseCase {
  constructor(
    private readonly internshipRepository: InternshipRepository,
  ) {}

  execute(command: UpdateInternshipInput) {
    return this.internshipRepository.update(command);
  }
}
