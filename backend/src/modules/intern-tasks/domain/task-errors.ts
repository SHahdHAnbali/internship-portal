import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { throwSupabaseRpcHttpException } from '../../../infrastructure/database/supabase-rpc-error.js';

const MESSAGES: Record<string, () => Error> = {
  task_title_required: () => new BadRequestException('Enter a task title.'),
  task_title_too_long: () => new BadRequestException('The task title can be at most 200 characters.'),
  task_description_too_long: () => new BadRequestException('The description can be at most 5000 characters.'),
  invalid_task_priority: () => new BadRequestException('Choose a priority: low, medium or high.'),
  cancellation_reason_required: () => new BadRequestException('Give a reason for cancelling the task.'),
  cancellation_reason_too_long: () => new BadRequestException('The cancellation reason is too long.'),
  invalid_review_decision: () => new BadRequestException('Choose whether to accept the task or request changes.'),
  review_feedback_required: () => new BadRequestException('Explain what should change.'),
  review_feedback_too_long: () => new BadRequestException('The feedback can be at most 2000 characters.'),
  progress_note_too_long: () => new BadRequestException('The progress note can be at most 2000 characters.'),
  invalid_task_status: () => new BadRequestException('Task status is invalid'),
  task_not_found: () => new NotFoundException('Task not found'),
  placement_not_assigned_to_mentor: () => new NotFoundException('Placement not found'),
  active_placement_not_found: () => new NotFoundException('You have no active placement.'),
  placement_not_active: () => new ConflictException('Tasks can only be managed while the placement is active.'),
  task_unchanged: () => new ConflictException('Nothing was changed.'),
  task_not_editable: () => new ConflictException('Only open tasks can be edited.'),
  task_not_cancellable: () => new ConflictException('Only open tasks can be cancelled.'),
  task_not_awaiting_review: () => new ConflictException('This task is not waiting for a review.'),
  invalid_task_status_transition: () => new ConflictException('This task cannot move to that status.'),
  task_not_withdrawable: () => new ConflictException('Only a submission that is still waiting for your Mentor’s review can be withdrawn.'),
  task_withdrawal_requires_due_date: () => new ConflictException('This task has no due date, so its submission cannot be withdrawn. Ask your Mentor if you need to change it.'),
  task_withdrawal_deadline_passed: () => new ConflictException('The due date has passed, so this submission can no longer be withdrawn.'),
  invalid_report_week: () => new BadRequestException('A report week starts on a Monday.'),
  report_text_too_long: () => new BadRequestException('Each report section can be at most 5000 characters.'),
  report_summary_required: () => new BadRequestException('Write a summary of your week before submitting.'),
  report_week_outside_placement: () => new ConflictException('You can only report weeks of your placement that have already started.'),
  report_not_editable: () => new ConflictException('This report has been submitted and can no longer be changed.'),
  report_not_found: () => new NotFoundException('Report not found'),
  report_not_awaiting_review: () => new ConflictException('This report is not waiting for a review.'),
};

// Maps task database-function errors to clear HTTP errors without exposing
// database text.
export function throwTaskError(error: { code?: string; message?: string }): never {
  const build = error.message ? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
