import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { throwSupabaseRpcHttpException } from '../../../infrastructure/database/supabase-rpc-error.js';

const MESSAGES: Record<string, () => Error> = {
  company_required: () => new BadRequestException('Enter a company name of at most 200 characters.'),
  department_too_long: () => new BadRequestException('The department name is too long.'),
  placement_dates_required: () => new BadRequestException('Enter a start and end date.'),
  invalid_placement_date_range: () => new BadRequestException('The end date must be on or after the start date.'),
  placement_already_ended: () => new ConflictException('This placement’s end date has already passed.'),
  cancellation_reason_required: () => new BadRequestException('Give a reason for cancelling the placement.'),
  cancellation_reason_too_long: () => new BadRequestException('The cancellation reason is too long.'),
  application_not_found: () => new NotFoundException('Application not found'),
  placement_not_found: () => new NotFoundException('Placement not found'),
  application_not_eligible: () => new ConflictException('Only a selected application can get a placement.'),
  placement_already_exists: () => new ConflictException('This application already has an open placement.'),
  placement_not_eligible: () => new ConflictException('Only a scheduled placement of a selected application can be activated.'),
  placement_not_completable: () => new ConflictException('Only an active placement can be completed.'),
  early_end_reason_required: () => new BadRequestException('Give a reason for ending the placement before its end date.'),
  completion_note_too_long: () => new BadRequestException('The note is too long.'),
  // Completion issues the certificate in the same transaction; without the
  // intern's name or the training title nothing is completed.
  certificate_source_incomplete: () => new ConflictException('The certificate of completion cannot be issued because the intern’s name or the training title is missing. Correct it, then complete the placement.'),
  // Raised by the database until the task retirement migration removes the
  // legacy task check; tasks can no longer be closed from the portal.
  placement_has_open_tasks: () => new ConflictException('This placement still has open tasks from the retired task feature, so it cannot be completed until the pending database update is applied.'),
  placement_has_pending_reports: () => new ConflictException('A weekly report is waiting for the Mentor’s review. Ask the Mentor to review it first.'),
  placement_not_cancellable: () => new ConflictException('Only a placement that has not started can be cancelled.'),
  applicant_auth_link_missing: () => new ConflictException('The applicant has no account yet, so the placement cannot be activated.'),
  applicant_profile_not_eligible: () => new ConflictException('The applicant’s account is not an applicant account, so it cannot become an intern.'),
  applicant_already_has_active_placement: () => new ConflictException('This applicant already has an active placement.'),
  applicant_role_changed: () => new ConflictException('The applicant’s account changed during activation. Please try again.'),
  training_not_planned: () => new ConflictException('This application’s training is not linked to a training opportunity.'),
  training_capacity_not_set: () => new ConflictException('Set the number of seats for this training in Training Planning first.'),
  selection_released: () => new ConflictException('This selection was released, so the applicant cannot receive another placement.'),
  training_selection_closed: () => new ConflictException('Selection is closed for this training, so a cancelled placement cannot be replaced. Reopen selection in Training Planning first.'),
  training_capacity_full: () => new ConflictException('All seats for this training already have active placements.'),
  mentor_profile_required: () => new BadRequestException('Choose an existing Mentor.'),
  mentor_inactive: () => new ConflictException('This Mentor’s account is deactivated, so they cannot be assigned.'),
  mentor_unchanged: () => new ConflictException('This Mentor is already assigned to the placement.'),
  mentor_not_assigned: () => new ConflictException('This placement has no Mentor to remove.'),
  mentor_required: () => new ConflictException('Assign a Mentor to this placement before activating it.'),
  active_placement_requires_mentor: () => new ConflictException('An active placement must always have a Mentor. Choose a replacement Mentor and use Change Mentor instead.'),
  placement_not_assignable: () => new ConflictException('Only a scheduled or active placement can have its Mentor changed.'),
  note_too_long: () => new BadRequestException('The note is too long.'),
};

// Activation refers to the Mentor already assigned to the placement, so the
// assignment wording ("cannot be assigned") would mislead HR there.
export const ACTIVATION_MESSAGES: Record<string, () => Error> = {
  mentor_profile_required: () => new ConflictException('The assigned Mentor no longer has a Mentor account. Assign an active Mentor before activating the placement.'),
  mentor_inactive: () => new ConflictException('The assigned Mentor’s account is deactivated. Assign an active Mentor before activating the placement.'),
};

// Maps placement database-function errors to clear HTTP errors without
// exposing database text.
export function throwPlacementError(
  error: { code?: string; message?: string },
  overrides: Record<string, () => Error> = {},
): never {
  const build = error.message ? overrides[error.message] ?? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
