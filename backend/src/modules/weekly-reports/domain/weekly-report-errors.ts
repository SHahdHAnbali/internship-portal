import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { throwSupabaseRpcHttpException } from '../../../infrastructure/database/supabase-rpc-error.js';

// Same keys as the weekly-report database functions raise (formerly mapped in
// the task module's error table; the wording no longer mentions tasks).
const MESSAGES: Record<string, () => Error> = {
  invalid_report_week: () => new BadRequestException('A report week starts on a Monday.'),
  report_text_too_long: () => new BadRequestException('Each report section can be at most 5000 characters.'),
  report_summary_required: () => new BadRequestException('Write a summary of your week before submitting.'),
  invalid_review_decision: () => new BadRequestException('Choose whether to accept the report or return it.'),
  review_feedback_required: () => new BadRequestException('Explain what should change.'),
  review_feedback_too_long: () => new BadRequestException('The feedback can be at most 2000 characters.'),
  report_not_found: () => new NotFoundException('Report not found'),
  placement_not_assigned_to_mentor: () => new NotFoundException('Placement not found'),
  active_placement_not_found: () => new NotFoundException('You have no active placement.'),
  report_week_outside_placement: () => new ConflictException('You can only report weeks of your placement that have already started.'),
  report_not_editable: () => new ConflictException('This report has been submitted and can no longer be changed.'),
  report_not_awaiting_review: () => new ConflictException('This report is not waiting for a review.'),
  placement_not_active: () => new ConflictException('Weekly reports can only be changed while the placement is active.'),
};

// Maps weekly-report database-function errors to clear HTTP errors without
// exposing database text.
export function throwWeeklyReportError(error: { code?: string; message?: string }): never {
  const build = error.message ? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
