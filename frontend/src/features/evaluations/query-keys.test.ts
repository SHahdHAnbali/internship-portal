import { describe, expect, it, vi } from 'vitest';

// The service module imports the API client (and through it the Supabase
// client); only the error class is needed here.
vi.mock('@/lib/api-client', () => ({
  SESSION_EXPIRED_MESSAGE: 'session-expired',
  PASSWORD_SETUP_REQUIRED_MESSAGE: 'password-setup-required',
  IDENTITY_MISMATCH_MESSAGE: 'identity-mismatch',
  SESSION_RENEWED_MESSAGE: 'session-renewed',
  authenticatedFetch: vi.fn(),
}));

import { EvaluationRequestError } from './evaluations.service';
import { evaluationQueryKeys, isAccessError } from './query-keys';

const refused = (status: number | null, code?: string) => new EvaluationRequestError({ outcome: 'not-applied', status, code });

describe('isAccessError', () => {
  it.each([
    [401, 'SESSION_EXPIRED'],
    [403, 'EVALUATION_ACCESS_DENIED'],
    [404, 'PLACEMENT_NOT_FOUND'],
    [404, 'EVALUATION_NOT_FOUND'],
    [403, undefined],
  ])('treats %s %s as a loss of access', (status, code) => {
    expect(isAccessError(refused(status, code))).toBe(true);
  });

  it.each([
    [401, 'SESSION_RENEWED'],
    [null, 'IDENTITY_MISMATCH'],
    [401, 'IDENTITY_MISMATCH'],
  ])('does not treat %s %s (session renewal or a pending sign-in change) as a loss of access', (status, code) => {
    expect(isAccessError(refused(status, code))).toBe(false);
  });

  it('ignores unknown outcomes and other errors', () => {
    expect(isAccessError(new EvaluationRequestError({ outcome: 'unknown' }))).toBe(false);
    expect(isAccessError(refused(409, 'PLACEMENT_NOT_ACTIVE'))).toBe(false);
    expect(isAccessError(new Error('x'))).toBe(false);
  });

  it('keeps evaluation keys user-scoped', () => {
    expect(evaluationQueryKeys.mentorEvaluations('m1', 'p1')).not.toEqual(evaluationQueryKeys.mentorEvaluations('m2', 'p1'));
  });
});
