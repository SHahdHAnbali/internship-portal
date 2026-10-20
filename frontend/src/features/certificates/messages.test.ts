import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  SESSION_EXPIRED_MESSAGE: 'session-expired',
  PASSWORD_SETUP_REQUIRED_MESSAGE: 'password-setup-required',
  IDENTITY_MISMATCH_MESSAGE: 'identity-mismatch',
  SESSION_RENEWED_MESSAGE: 'session-renewed',
  authenticatedFetch: vi.fn(),
}));

import { CertificateRequestError } from './certificates.service';
import {
  NAME_FIT_LIMITS,
  DETAILS_FIT_LIMITS,
  certificateErrorMessage,
  errorMessage,
  fitSize,
  formatCompletionDate,
  formatDuration,
  indefiniteArticle,
  reissueReasonProblem,
} from './messages';
import { certificateQueryKeys, isAccessError } from './query-keys';

describe('certificate messages', () => {
  it('formats the completion date as a calendar date, independent of the time zone', () => {
    expect(formatCompletionDate('2026-03-11')).toBe('11 March 2026');
    expect(formatCompletionDate('2026-12-31')).toBe('31 December 2026');
    expect(formatCompletionDate('2026-02-30')).toBe('2026-02-30');
    expect(formatCompletionDate('not a date')).toBe('not a date');
  });

  it('formats the actual duration as a compound adjective, never rounding days away', () => {
    expect(formatDuration({ months: 3, days: 0 })).toBe('3-month');
    expect(formatDuration({ months: 2, days: 30 })).toBe('2-month, 30-day');
    expect(formatDuration({ months: 0, days: 1 })).toBe('1-day');
    expect(formatDuration({ months: 0, days: 0 })).toBe('0-day');
    expect(formatDuration({ months: 13, days: 15 })).toBe('13-month, 15-day');
  });

  it('chooses "a" or "an" by how the number is read', () => {
    for (const phrase of ['8-month', '11-day', '18-day', '80-day', '83-day', '800-day', '11000-day']) {
      expect(indefiniteArticle(phrase)).toBe('an');
    }
    for (const phrase of ['1-day', '3-month', '12-month', '110-day', '1100-day', '1800-day', '28-day']) {
      expect(indefiniteArticle(phrase)).toBe('a');
    }
  });

  it('validates the reissue reason like the server (trimmed, 1000 characters)', () => {
    expect(reissueReasonProblem('')).toBe('REISSUE_REASON_REQUIRED');
    expect(reissueReasonProblem(' \n\t ')).toBe('REISSUE_REASON_REQUIRED');
    expect(reissueReasonProblem('Name corrected')).toBeNull();
    expect(reissueReasonProblem(`  ${'x'.repeat(1000)}  `)).toBeNull();
    expect(reissueReasonProblem('x'.repeat(1001))).toBe('REISSUE_REASON_TOO_LONG');
    // Emoji count as one character each (2 UTF-16 units).
    expect(reissueReasonProblem('😀'.repeat(1000))).toBeNull();
    expect(reissueReasonProblem('😀'.repeat(1001))).toBe('REISSUE_REASON_TOO_LONG');
  });

  it('steps the type size down for long names and training titles', () => {
    expect(fitSize('Maya Haddad', NAME_FIT_LIMITS)).toBe('lg');
    expect(fitSize('Alexandra Catherine Montgomery-Smith', NAME_FIT_LIMITS)).toBe('md');
    expect(fitSize('A'.repeat(60), NAME_FIT_LIMITS)).toBe('sm');
    expect(fitSize('A'.repeat(200), NAME_FIT_LIMITS)).toBe('xs');
    expect(fitSize('Software Engineering', DETAILS_FIT_LIMITS)).toBe('lg');
    expect(fitSize('B'.repeat(100), DETAILS_FIT_LIMITS)).toBe('sm');
    expect(fitSize('B'.repeat(150), DETAILS_FIT_LIMITS)).toBe('xs');
    expect(fitSize('محمد عبد الرحمن', NAME_FIT_LIMITS)).toBe('lg');
  });

  it('shows known codes, and a generic message for unknown outcomes and other errors', () => {
    expect(errorMessage('CERTIFICATE_NOT_FOUND')).toMatch(/only after HR has completed/);
    expect(errorMessage('SOMETHING_NEW')).toBe(errorMessage(undefined));
    expect(certificateErrorMessage(new CertificateRequestError({ outcome: 'not-applied', status: 403, code: 'CERTIFICATE_ACCESS_DENIED' })))
      .toBe('You do not have access to this certificate.');
    expect(certificateErrorMessage(new CertificateRequestError({ outcome: 'unknown' }))).toBe(errorMessage(undefined));
    expect(certificateErrorMessage(new Error('database said x'))).toBe(errorMessage(undefined));
  });

  it('never shows database text for a server error', () => {
    expect(errorMessage('CERTIFICATE_SERVER_ERROR')).toBe('Certificates are not available right now. Try again later.');
  });
});

describe('certificate query keys', () => {
  it('are scoped by the signed-in user', () => {
    expect(certificateQueryKeys.internCertificates('u1')).not.toEqual(certificateQueryKeys.internCertificates('u2'));
    expect(certificateQueryKeys.internCertificate('u1', 'p1')).not.toEqual(certificateQueryKeys.internCertificate('u2', 'p1'));
    expect(certificateQueryKeys.hrPlacementCertificates('h1', 'p1')).not.toEqual(certificateQueryKeys.hrPlacementCertificates('h2', 'p1'));
    expect(certificateQueryKeys.hrPlacementCertificates('h1', 'p1').slice(0, 3)).toEqual([...certificateQueryKeys.hrAll('h1')]);
  });

  it('treat refusals as a loss of access, but not a renewed sign-in', () => {
    const refused = (status: number | null, code?: string) => new CertificateRequestError({ outcome: 'not-applied', status, code });
    expect(isAccessError(refused(404, 'CERTIFICATE_NOT_FOUND'))).toBe(true);
    expect(isAccessError(refused(403, 'CERTIFICATE_ACCESS_DENIED'))).toBe(true);
    expect(isAccessError(refused(401, 'SESSION_RENEWED'))).toBe(false);
    expect(isAccessError(refused(409, 'CERTIFICATE_NOT_CURRENT'))).toBe(false);
    expect(isAccessError(new CertificateRequestError({ outcome: 'unknown' }))).toBe(false);
  });
});
