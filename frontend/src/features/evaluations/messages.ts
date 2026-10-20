import type { EvaluationPlacementStatus, EvaluationPublicationState } from './types';

// User-facing text for evaluations, kept in one place for the later
// localization phase. Never shows database details.

const STATE_LABELS: Record<EvaluationPublicationState, string> = {
  DRAFT: 'Draft',
  UNPUBLISHED_CHANGES: 'Unpublished changes',
  PUBLISHED: 'Published',
};

// The server-provided state, with "— placement completed" for completed placements.
export function evaluationStateLabel(state: EvaluationPublicationState, placementStatus: EvaluationPlacementStatus): string {
  return placementStatus === 'COMPLETED' ? `${STATE_LABELS[state]} — placement completed` : STATE_LABELS[state];
}

export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: 'The request was not accepted. Reload the page and try again.',
  EVALUATION_ACCESS_DENIED: 'You no longer have access to evaluations for this placement.',
  PLACEMENT_NOT_FOUND: 'This placement is not available to you.',
  EVALUATION_NOT_FOUND: 'This evaluation is not available to you.',
  PLACEMENT_NOT_ACTIVE: 'The placement is no longer active, so its evaluations are read-only.',
  EVALUATION_REVISION_CONFLICT: 'This evaluation was changed after you loaded it.',
  EVALUATION_NOTHING_TO_PUBLISH: 'The saved text is already published.',
  EVALUATION_CONTENT_TOO_LONG: 'The evaluation can be at most 40,000 characters.',
  EVALUATION_CONTENT_INVALID_CHARACTERS: 'The evaluation contains characters that cannot be saved (control characters).',
  EVALUATION_CONTENT_REQUIRED: 'Write the evaluation before publishing it.',
  EVALUATION_CONCURRENT_UPDATE: 'The evaluation could not be saved because of a simultaneous change. Nothing was changed; try again.',
  REQUEST_TOO_LARGE: 'The evaluation is larger than the server accepts in one request (about 100 KB). It was not saved. Shorten it (characters such as emoji take more space) and save again.',
  SESSION_EXPIRED: 'Your session has expired, so this change was not saved. Sign in again.',
  PASSWORD_SETUP_REQUIRED: 'Set a password before using the portal.',
  IDENTITY_MISMATCH: 'You signed in or out in another tab, so nothing was sent. Copy your text if you need it, then reload this page.',
  SESSION_RENEWED: 'Your sign-in was renewed while this was being sent, so nothing was changed. Try again.',
  LEGACY_DRAFT_KEY: 'This unsaved draft comes from an older version of the portal and cannot be saved as it is. Your text is kept.',
  EVALUATION_CREATE_KEY_REUSED: 'This draft could not be matched to its earlier request. Copy your text and start a new evaluation.',
  EVALUATION_SERVER_ERROR: 'The request could not be completed. Try again later.',
  REQUEST_FAILED: 'The request could not be completed. Try again later.',
};

export function errorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES.REQUEST_FAILED;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
