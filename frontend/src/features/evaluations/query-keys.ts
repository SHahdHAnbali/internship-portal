import { EvaluationRequestError } from './evaluations.service';

// Query keys for evaluation data, scoped by the signed-in user (in addition to
// the cache being cleared when the user changes), so one user's cached data is
// never served to another. ['mentor', 'placements', …] keeps the prefix that
// other Mentor pages invalidate.
export const evaluationQueryKeys = {
  mentorPlacements: (userId: string) => ['mentor', 'placements', userId] as const,
  mentorEvaluations: (userId: string, placementId: string) => ['mentor', userId, 'evaluations', placementId] as const,
  internEvaluations: (userId: string) => ['intern', userId, 'evaluations'] as const,
  internEvaluation: (userId: string, evaluationId: string) => ['intern', userId, 'evaluations', evaluationId] as const,
};

// Refusals that are not a loss of access: the request was not applied, but
// the Mentor's access is unchanged (the sign-in was renewed while it was on
// its way) or this tab first has to catch up with a sign-in change made in
// another tab. Data shown so far stays on screen; the error is reported and
// nothing is retried automatically. Access itself is still decided by the
// server on every request.
const NOT_AN_ACCESS_LOSS = new Set(['SESSION_RENEWED', 'IDENTITY_MISMATCH']);

// The server refused access (session ended, no longer assigned, not found):
// data fetched earlier must no longer be shown.
export function isAccessError(error: unknown): boolean {
  return error instanceof EvaluationRequestError
    && error.outcome === 'not-applied'
    && !(error.code !== undefined && NOT_AN_ACCESS_LOSS.has(error.code))
    && (error.status === 401 || error.status === 403 || error.status === 404);
}
