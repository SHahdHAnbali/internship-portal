import { HttpException } from '@nestjs/common';

// Stable, machine-readable certificate error codes. Bodies follow the
// project's { statusCode, error, code, message } shape (see
// modules/evaluations/domain/evaluation-errors.ts) and never contain database
// text, SQL, names, titles or reasons.
export type CertificateErrorCode =
  | 'VALIDATION_FAILED'
  | 'CERTIFICATE_ACCESS_DENIED'
  | 'PLACEMENT_NOT_FOUND'
  | 'CERTIFICATE_NOT_FOUND'
  | 'PLACEMENT_NOT_COMPLETED'
  | 'CERTIFICATE_NOT_CURRENT'
  | 'CERTIFICATE_SOURCE_INCOMPLETE'
  | 'REISSUE_REASON_REQUIRED'
  | 'REISSUE_REASON_TOO_LONG'
  | 'CERTIFICATE_CONCURRENT_UPDATE'
  | 'CERTIFICATE_SERVER_ERROR';

const ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

interface CertificateErrorDefinition {
  status: 400 | 403 | 404 | 409 | 500;
  code: CertificateErrorCode;
  message: string;
}

export const REISSUE_REASON_MAX_LENGTH = 1000;

export const CERTIFICATE_ERRORS: Record<CertificateErrorCode, CertificateErrorDefinition> = {
  VALIDATION_FAILED: { status: 400, code: 'VALIDATION_FAILED', message: 'The request is invalid.' },
  CERTIFICATE_ACCESS_DENIED: { status: 403, code: 'CERTIFICATE_ACCESS_DENIED', message: 'You do not have access to certificates.' },
  PLACEMENT_NOT_FOUND: { status: 404, code: 'PLACEMENT_NOT_FOUND', message: 'Placement not found.' },
  CERTIFICATE_NOT_FOUND: { status: 404, code: 'CERTIFICATE_NOT_FOUND', message: 'Certificate not found.' },
  PLACEMENT_NOT_COMPLETED: {
    status: 409, code: 'PLACEMENT_NOT_COMPLETED',
    message: 'A certificate exists only after the placement has been completed.',
  },
  CERTIFICATE_NOT_CURRENT: {
    status: 409, code: 'CERTIFICATE_NOT_CURRENT',
    message: 'This certificate has already been replaced. Reload the certificates and reissue the current one.',
  },
  CERTIFICATE_SOURCE_INCOMPLETE: {
    status: 409, code: 'CERTIFICATE_SOURCE_INCOMPLETE',
    message: 'The certificate cannot be issued because the intern’s name or the training title is missing.',
  },
  REISSUE_REASON_REQUIRED: { status: 400, code: 'REISSUE_REASON_REQUIRED', message: 'Give a reason for reissuing the certificate.' },
  REISSUE_REASON_TOO_LONG: {
    status: 400, code: 'REISSUE_REASON_TOO_LONG',
    message: `The reason can be at most ${REISSUE_REASON_MAX_LENGTH.toLocaleString('en-US')} characters.`,
  },
  CERTIFICATE_CONCURRENT_UPDATE: {
    status: 409, code: 'CERTIFICATE_CONCURRENT_UPDATE',
    message: 'The certificate was changed at the same time by another request. Reload and try again.',
  },
  CERTIFICATE_SERVER_ERROR: {
    status: 500, code: 'CERTIFICATE_SERVER_ERROR',
    message: 'The certificate request could not be completed.',
  },
};

export function certificateError(code: CertificateErrorCode): HttpException {
  const definition = CERTIFICATE_ERRORS[code];
  return new HttpException(
    {
      statusCode: definition.status,
      error: ERROR_NAMES[definition.status],
      code: definition.code,
      message: definition.message,
    },
    definition.status,
  );
}

// The certificate functions (supabase/migrations/20261019000000_internship_certificates.sql)
// follow the placement convention: a shared SQLSTATE per class (PZ400, PZ403,
// PZ404, PZ409) plus a message key. A key is only trusted with the SQLSTATE
// the migration raises it with.
const BY_MESSAGE_KEY: Record<string, { sqlstate: string; code: CertificateErrorCode }> = {
  hr_role_required: { sqlstate: 'PZ403', code: 'CERTIFICATE_ACCESS_DENIED' },
  intern_role_required: { sqlstate: 'PZ403', code: 'CERTIFICATE_ACCESS_DENIED' },
  placement_not_found: { sqlstate: 'PZ404', code: 'PLACEMENT_NOT_FOUND' },
  certificate_not_found: { sqlstate: 'PZ404', code: 'CERTIFICATE_NOT_FOUND' },
  placement_not_completed: { sqlstate: 'PZ409', code: 'PLACEMENT_NOT_COMPLETED' },
  certificate_not_current: { sqlstate: 'PZ409', code: 'CERTIFICATE_NOT_CURRENT' },
  certificate_source_incomplete: { sqlstate: 'PZ409', code: 'CERTIFICATE_SOURCE_INCOMPLETE' },
  reissue_reason_required: { sqlstate: 'PZ400', code: 'REISSUE_REASON_REQUIRED' },
  reissue_reason_too_long: { sqlstate: 'PZ400', code: 'REISSUE_REASON_TOO_LONG' },
};

// Deadlock, serialization failure, or a unique-index race on the current
// certificate: the transaction was rolled back and nothing changed.
const CONCURRENCY_SQLSTATES = new Set(['40P01', '40001', '23505']);

export interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

// The certificate error code for a database error, or undefined when it is
// not one of the expected conditions (then it is reported as a server error;
// certificate_immutable, a guard against direct writes, is one of those).
export function knownCertificateErrorCode(error: DatabaseErrorLike): CertificateErrorCode | undefined {
  if (typeof error.code === 'string' && CONCURRENCY_SQLSTATES.has(error.code)) {
    return 'CERTIFICATE_CONCURRENT_UPDATE';
  }
  const known = typeof error.message === 'string' && Object.hasOwn(BY_MESSAGE_KEY, error.message)
    ? BY_MESSAGE_KEY[error.message]
    : undefined;
  return known && known.sqlstate === error.code ? known.code : undefined;
}

export function certificateErrorFromDatabase(error: DatabaseErrorLike): HttpException {
  return certificateError(knownCertificateErrorCode(error) ?? 'CERTIFICATE_SERVER_ERROR');
}
