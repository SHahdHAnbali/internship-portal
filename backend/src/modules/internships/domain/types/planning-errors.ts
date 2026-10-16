import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';

const MESSAGES: Record<string, () => Error> = {
  invalid_training_title: () => new BadRequestException('Enter a title of at most 150 characters.'),
  invalid_training_capacity: () => new BadRequestException('Capacity must be a whole number between 0 and 10000.'),
  invalid_training_status: () => new BadRequestException('Choose whether the training is listed for applicants.'),
  invalid_selection_status: () => new BadRequestException('Choose a valid selection status.'),
  invalid_training_request: () => new BadRequestException('Choose a requested training.'),
  planning_note_too_long: () => new BadRequestException('The note is too long.'),
  training_not_found: () => new NotFoundException('Training not found'),
  training_request_not_found: () => new NotFoundException('No submitted application requests this training.'),
  training_request_not_mapped: () => new NotFoundException('This requested training is not linked to a training opportunity.'),
  capacity_below_selected: () => new ConflictException('Capacity cannot be lower than the seats already consumed by selected applicants.'),
  capacity_required_with_selections: () => new ConflictException('Capacity cannot be cleared while selected applicants hold seats.'),
  training_has_selections: () => new ConflictException('Applicants were already selected for this training, so its approval cannot be withdrawn. Close selection instead.'),
  training_unchanged: () => new ConflictException('Nothing was changed.'),
  training_request_already_mapped: () => new ConflictException('This requested training is already linked to that opportunity.'),
  training_request_has_selections: () => new ConflictException('Applicants for this requested training are already selected, so its link cannot change.'),
};

// Maps planning database-function errors to clear HTTP errors without
// exposing database text.
export function throwPlanningError(error: { code?: string; message?: string }): never {
  const build = error.message ? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
