import { env } from '@/config/env';
import {
  IDENTITY_MISMATCH_MESSAGE,
  PASSWORD_SETUP_REQUIRED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  SESSION_RENEWED_MESSAGE,
  authenticatedFetch,
} from '@/lib/api-client';

import type { CertificateDuration, HrCertificate, InternCertificate } from './types';

// Outcome of a failed request:
// - 'not-applied': the server answered with an error (or the request was never
//   sent), so nothing was changed.
// - 'unknown': no trustworthy answer (network failure, timeout, unreadable
//   success body). A reissue may or may not have happened: never report it
//   as failed and never retry it automatically.
export type CertificateRequestOutcome = 'not-applied' | 'unknown';

export class CertificateRequestError extends Error {
  readonly outcome: CertificateRequestOutcome;
  readonly status: number | null;
  readonly code: string | undefined;

  constructor(options: { outcome: CertificateRequestOutcome; status?: number | null; code?: string }) {
    super(options.code ?? options.outcome);
    this.name = 'CertificateRequestError';
    this.outcome = options.outcome;
    this.status = options.status ?? null;
    this.code = options.code;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

function codeForStatus(status: number): string {
  if (status === 401) return 'SESSION_EXPIRED';
  if (status === 403) return 'CERTIFICATE_ACCESS_DENIED';
  if (status === 404) return 'CERTIFICATE_NOT_FOUND';
  return 'REQUEST_FAILED';
}

async function request<T>(path: string, init: RequestInit, isValid: (value: unknown) => value is T): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await authenticatedFetch(`${env.apiUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (error) {
    clearTimeout(timeout);
    // authenticatedFetch refuses to send without a valid session for this
    // tab's user (and clears an expired one): nothing was changed.
    const message = error instanceof Error ? error.message : '';
    if (message === SESSION_EXPIRED_MESSAGE) throw new CertificateRequestError({ outcome: 'not-applied', status: 401, code: 'SESSION_EXPIRED' });
    if (message === PASSWORD_SETUP_REQUIRED_MESSAGE) throw new CertificateRequestError({ outcome: 'not-applied', status: 403, code: 'PASSWORD_SETUP_REQUIRED' });
    if (message === IDENTITY_MISMATCH_MESSAGE) throw new CertificateRequestError({ outcome: 'not-applied', code: 'IDENTITY_MISMATCH' });
    if (message === SESSION_RENEWED_MESSAGE) throw new CertificateRequestError({ outcome: 'not-applied', status: 401, code: 'SESSION_RENEWED' });
    // Network failure, timeout or abort: the request may have reached the server.
    throw new CertificateRequestError({ outcome: 'unknown' });
  }

  try {
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      const code = typeof body?.code === 'string' && body.code !== '' ? body.code : codeForStatus(response.status);
      throw new CertificateRequestError({ outcome: 'not-applied', status: response.status, code });
    }
    const value: unknown = await response.json().catch(() => undefined);
    if (!isValid(value)) {
      // The server reported success, but the result cannot be read or trusted.
      throw new CertificateRequestError({ outcome: 'unknown', status: response.status });
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Intern ---------------------------------------------------------------

export async function listMyCertificates(): Promise<InternCertificate[]> {
  const rows = await request('/intern/me/certificates', { method: 'GET' }, isInternCertificateList);
  return rows.map(toInternCertificate);
}

export async function getMyCertificate(placementId: string): Promise<InternCertificate> {
  const row = await request(`/intern/me/certificates/${encodeURIComponent(placementId)}`, { method: 'GET' }, isInternCertificate);
  return toInternCertificate(row);
}

// ---- HR ---------------------------------------------------------------------

export function listPlacementCertificates(placementId: string): Promise<HrCertificate[]> {
  return request(`/hr/placements/${encodeURIComponent(placementId)}/certificates`, { method: 'GET' }, isHrCertificateList);
}

// Sent once per confirmation; never retried automatically.
export function reissueCertificate(certificateId: string, reason: string): Promise<HrCertificate> {
  return request(
    `/hr/certificates/${encodeURIComponent(certificateId)}/reissue`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    isHrCertificate,
  );
}

// ---- Response checks and mapping -------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_FIELDS = ['placementId', 'certificateTitle', 'issuerName', 'recipientName', 'trainingTitle', 'issuedAt'];

const isNullableName = (value: unknown) => value === null || (typeof value === 'string' && value.trim() !== '');
const isCount = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

function isDuration(value: unknown): value is CertificateDuration | null {
  return value === null || (isObject(value) && isCount(value.months, 1200) && isCount(value.days, 31));
}

function isInternCertificate(value: unknown): value is InternCertificate {
  return isObject(value)
    && TEXT_FIELDS.every((key) => typeof value[key] === 'string' && value[key] !== '')
    && typeof value.completionDate === 'string' && DATE_PATTERN.test(value.completionDate)
    && isDuration(value.duration)
    && isNullableName(value.hrSignatoryName)
    && isNullableName(value.mentorSignatoryName);
}

function isInternCertificateList(value: unknown): value is InternCertificate[] {
  return Array.isArray(value) && value.every(isInternCertificate);
}

// Copies only the documented fields, so nothing else the server might send
// can reach the intern's screen or cache.
function toInternCertificate(value: InternCertificate): InternCertificate {
  return {
    placementId: value.placementId,
    certificateTitle: value.certificateTitle,
    issuerName: value.issuerName,
    recipientName: value.recipientName,
    trainingTitle: value.trainingTitle,
    duration: value.duration === null ? null : { months: value.duration.months, days: value.duration.days },
    completionDate: value.completionDate,
    hrSignatoryName: value.hrSignatoryName,
    mentorSignatoryName: value.mentorSignatoryName,
    issuedAt: value.issuedAt,
  };
}

function isHrCertificate(value: unknown): value is HrCertificate {
  if (!isObject(value) || !isInternCertificate(value)) return false;
  const record: Record<string, unknown> = value;
  return typeof record.id === 'string' && record.id !== ''
    && ['ISSUED', 'SUPERSEDED'].includes(String(record.status))
    && ['COMPLETION', 'BACKFILL', 'REISSUE'].includes(String(record.issueKind))
    && ['issuedByName', 'supersedesCertificateId', 'reissueReason', 'supersededAt']
      .every((key) => isNullableString(record[key]))
    && (record.placementStartDate === null
      || (typeof record.placementStartDate === 'string' && DATE_PATTERN.test(record.placementStartDate)));
}

function isHrCertificateList(value: unknown): value is HrCertificate[] {
  return Array.isArray(value) && value.every(isHrCertificate);
}
