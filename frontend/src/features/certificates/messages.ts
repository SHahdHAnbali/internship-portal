import { CertificateRequestError } from './certificates.service';
import type { CertificateIssueKind, CertificateStatus } from './types';

// User-facing text for certificates, kept in one place for the later
// localization phase. Never shows database details.

export const REISSUE_REASON_MAX_LENGTH = 1000;

export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: 'The request was not accepted. Reload the page and try again.',
  CERTIFICATE_ACCESS_DENIED: 'You do not have access to this certificate.',
  PLACEMENT_NOT_FOUND: 'This placement was not found.',
  CERTIFICATE_NOT_FOUND: 'This certificate is not available. A certificate exists only after HR has completed the internship.',
  PLACEMENT_NOT_COMPLETED: 'A certificate exists only after the placement has been completed.',
  CERTIFICATE_NOT_CURRENT: 'This certificate has already been replaced. The list has been reloaded; reissue the current certificate if needed.',
  CERTIFICATE_SOURCE_INCOMPLETE: 'The certificate cannot be issued because the intern’s name or the training title is missing. Correct it first.',
  REISSUE_REASON_REQUIRED: 'Give a reason for reissuing the certificate.',
  REISSUE_REASON_TOO_LONG: `The reason can be at most ${REISSUE_REASON_MAX_LENGTH.toLocaleString('en-US')} characters.`,
  CERTIFICATE_CONCURRENT_UPDATE: 'The certificate was changed at the same time by another request. Nothing was changed; reload and try again.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again.',
  PASSWORD_SETUP_REQUIRED: 'Set a password before using the portal.',
  IDENTITY_MISMATCH: 'You signed in or out in another tab, so nothing was sent. Reload this page.',
  SESSION_RENEWED: 'Your sign-in was renewed while this was being sent, so nothing was changed. Try again.',
  CERTIFICATE_SERVER_ERROR: 'Certificates are not available right now. Try again later.',
  REQUEST_FAILED: 'The request could not be completed. Try again later.',
};

export function errorMessage(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES.REQUEST_FAILED;
}

export function certificateErrorMessage(error: unknown): string {
  return error instanceof CertificateRequestError && error.outcome === 'not-applied'
    ? errorMessage(error.code)
    : errorMessage(undefined);
}

// A reissue whose outcome is unknown may have been applied.
export const REISSUE_OUTCOME_UNKNOWN_MESSAGE =
  'The connection was interrupted, so it is not known whether the certificate was reissued. The certificates have been reloaded: check them before trying again.';

export const STATUS_LABELS: Record<CertificateStatus, string> = {
  ISSUED: 'Current',
  SUPERSEDED: 'Superseded',
};

export const ISSUE_KIND_LABELS: Record<CertificateIssueKind, string> = {
  COMPLETION: 'Issued on completion',
  BACKFILL: 'Issued for an earlier completion',
  REISSUE: 'Reissued',
};

// Duration as a compound adjective for "a … internship": "3-month",
// "2-month, 8-day", "12-day". Never rounded: days are shown when present.
export function formatDuration(duration: { months: number; days: number }): string {
  const parts: string[] = [];
  if (duration.months > 0) parts.push(`${duration.months}-month`);
  if (duration.days > 0 || duration.months === 0) parts.push(`${duration.days}-day`);
  return parts.join(', ');
}

// Duration in words for HR screens: "2 months and 8 days", "1 day".
export function formatDurationWords(duration: { months: number; days: number }): string {
  const parts: string[] = [];
  if (duration.months > 0) parts.push(`${duration.months} ${duration.months === 1 ? 'month' : 'months'}`);
  if (duration.days > 0 || duration.months === 0) parts.push(`${duration.days} ${duration.days === 1 ? 'day' : 'days'}`);
  return parts.join(' and ');
}

// "a" or "an" before a phrase starting with a number, by its English
// pronunciation (8, 11, 18, 80–89, 800–899… are read with a vowel sound).
export function indefiniteArticle(phrase: string): 'a' | 'an' {
  const digits = /^\d+/.exec(phrase)?.[0];
  if (!digits) return /^[aeiou]/i.test(phrase) ? 'an' : 'a';
  const n = Number(digits);
  if (digits.startsWith('8')) return 'an';
  // 11, 18, and 11 000 / 18 000 (eleven/eighteen thousand) and so on.
  const group = digits.length % 3 === 2 ? Number(digits.slice(0, 2)) : n === 11 || n === 18 ? n : -1;
  return group === 11 || group === 18 ? 'an' : 'a';
}

// A completion date (YYYY-MM-DD) as a calendar date, e.g. "11 March 2026".
// Formatted in UTC from its parts so the viewer's time zone never moves it.
export function formatCompletionDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(match[3])) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// Characters as the server counts them (code points; String.length counts
// UTF-16 units).
export function countCharacters(text: string): number {
  return Array.from(text).length;
}

export type ReissueReasonProblem = 'REISSUE_REASON_REQUIRED' | 'REISSUE_REASON_TOO_LONG';

// The server trims the reason and allows at most 1000 characters.
export function reissueReasonProblem(reason: string): ReissueReasonProblem | null {
  const trimmed = reason.trim();
  if (trimmed === '') return 'REISSUE_REASON_REQUIRED';
  return countCharacters(trimmed) > REISSUE_REASON_MAX_LENGTH ? 'REISSUE_REASON_TOO_LONG' : null;
}

// Size step for a line of the certificate, so long names and titles stay on
// the page: the longer the text, the smaller the type (it also wraps).
export type FitSize = 'lg' | 'md' | 'sm' | 'xs';

export function fitSize(text: string, limits: readonly [number, number, number]): FitSize {
  const length = countCharacters(text.trim());
  if (length <= limits[0]) return 'lg';
  if (length <= limits[1]) return 'md';
  if (length <= limits[2]) return 'sm';
  return 'xs';
}

export const NAME_FIT_LIMITS = [28, 44, 70] as const;
// The internship details line (training title, or duration, type and company).
export const DETAILS_FIT_LIMITS = [50, 80, 120] as const;
export const SIGNATORY_FIT_LIMITS = [30, 45, 70] as const;
