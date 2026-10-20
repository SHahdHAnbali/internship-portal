import { HttpException } from '@nestjs/common';

// Stable, machine-readable evaluation error codes. Bodies follow the
// project's { statusCode, error, code, message } shape (see
// infrastructure/auth/password-setup.ts) and never contain database text,
// SQL or evaluation content.
export type EvaluationErrorCode =
  | 'VALIDATION_FAILED'
  | 'EVALUATION_ACCESS_DENIED'
  | 'PLACEMENT_NOT_FOUND'
  | 'EVALUATION_NOT_FOUND'
  | 'PLACEMENT_NOT_ACTIVE'
  | 'EVALUATION_REVISION_CONFLICT'
  | 'EVALUATION_NOTHING_TO_PUBLISH'
  | 'EVALUATION_CONTENT_TOO_LONG'
  | 'EVALUATION_CONTENT_INVALID_CHARACTERS'
  | 'EVALUATION_CONTENT_REQUIRED'
  | 'EVALUATION_CONCURRENT_UPDATE'
  | 'EVALUATION_CREATE_KEY_REUSED'
  | 'EVALUATION_SERVER_ERROR';

const ERROR_NAMES: Record<number, string> = {
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

interface EvaluationErrorDefinition {
  status: 400 | 403 | 404 | 409 | 500;
  code: EvaluationErrorCode;
  message: string;
}

export const EVALUATION_ERRORS: Record<EvaluationErrorCode, EvaluationErrorDefinition> = {
  VALIDATION_FAILED: { status: 400, code: 'VALIDATION_FAILED', message: 'The request is invalid.' },
  EVALUATION_ACCESS_DENIED: { status: 403, code: 'EVALUATION_ACCESS_DENIED', message: 'You do not have access to evaluations.' },
  PLACEMENT_NOT_FOUND: { status: 404, code: 'PLACEMENT_NOT_FOUND', message: 'Placement not found.' },
  EVALUATION_NOT_FOUND: { status: 404, code: 'EVALUATION_NOT_FOUND', message: 'Evaluation not found.' },
  PLACEMENT_NOT_ACTIVE: {
    status: 409, code: 'PLACEMENT_NOT_ACTIVE',
    message: 'Evaluations can only be changed while the placement is active.',
  },
  EVALUATION_REVISION_CONFLICT: {
    status: 409, code: 'EVALUATION_REVISION_CONFLICT',
    message: 'This evaluation was changed after you loaded it. Reload it before saving or publishing.',
  },
  EVALUATION_NOTHING_TO_PUBLISH: {
    status: 409, code: 'EVALUATION_NOTHING_TO_PUBLISH',
    message: 'The saved text is already published.',
  },
  EVALUATION_CONTENT_TOO_LONG: {
    status: 400, code: 'EVALUATION_CONTENT_TOO_LONG',
    message: 'The evaluation can be at most 40,000 characters.',
  },
  EVALUATION_CONTENT_INVALID_CHARACTERS: {
    status: 400, code: 'EVALUATION_CONTENT_INVALID_CHARACTERS',
    message: 'The evaluation contains characters that cannot be saved.',
  },
  EVALUATION_CONTENT_REQUIRED: {
    status: 400, code: 'EVALUATION_CONTENT_REQUIRED',
    message: 'Write the evaluation before publishing it.',
  },
  EVALUATION_CONCURRENT_UPDATE: {
    status: 409, code: 'EVALUATION_CONCURRENT_UPDATE',
    message: 'The evaluation could not be saved because of a simultaneous change. Try again.',
  },
  EVALUATION_CREATE_KEY_REUSED: {
    status: 409, code: 'EVALUATION_CREATE_KEY_REUSED',
    message: 'This draft was already created by an earlier request. Continue with the existing evaluation.',
  },
  EVALUATION_SERVER_ERROR: {
    status: 500, code: 'EVALUATION_SERVER_ERROR',
    message: 'The evaluation request could not be completed.',
  },
};

export function evaluationError(code: EvaluationErrorCode, extra: Record<string, unknown> = {}): HttpException {
  const definition = EVALUATION_ERRORS[code];
  return new HttpException(
    {
      statusCode: definition.status,
      error: ERROR_NAMES[definition.status],
      code: definition.code,
      message: definition.message,
      ...extra,
    },
    definition.status,
  );
}

// Database errors raised by the evaluation functions: one SQLSTATE and one
// message key per condition. The SQLSTATE is authoritative; the message key
// is only consulted if no known SQLSTATE arrives.
const BY_SQLSTATE: Record<string, EvaluationErrorCode> = {
  PZE01: 'EVALUATION_ACCESS_DENIED',
  PZE02: 'PLACEMENT_NOT_FOUND',
  PZE03: 'EVALUATION_NOT_FOUND',
  PZE04: 'PLACEMENT_NOT_ACTIVE',
  PZE05: 'EVALUATION_REVISION_CONFLICT',
  PZE06: 'EVALUATION_NOTHING_TO_PUBLISH',
  PZE07: 'EVALUATION_CONTENT_TOO_LONG',
  PZE08: 'EVALUATION_CONTENT_INVALID_CHARACTERS',
  PZE09: 'EVALUATION_CONTENT_REQUIRED',
  // Invariant violations (direct writes): an internal error, details withheld.
  PZE10: 'EVALUATION_SERVER_ERROR',
  PZE11: 'EVALUATION_CREATE_KEY_REUSED',
  PZE12: 'VALIDATION_FAILED',
  // Deadlock detected / serialization failure: the transaction was rolled back.
  '40P01': 'EVALUATION_CONCURRENT_UPDATE',
  '40001': 'EVALUATION_CONCURRENT_UPDATE',
};

const BY_MESSAGE_KEY: Record<string, EvaluationErrorCode> = {
  evaluation_access_denied: 'EVALUATION_ACCESS_DENIED',
  placement_not_found: 'PLACEMENT_NOT_FOUND',
  evaluation_not_found: 'EVALUATION_NOT_FOUND',
  placement_not_active: 'PLACEMENT_NOT_ACTIVE',
  evaluation_revision_conflict: 'EVALUATION_REVISION_CONFLICT',
  evaluation_nothing_to_publish: 'EVALUATION_NOTHING_TO_PUBLISH',
  evaluation_content_too_long: 'EVALUATION_CONTENT_TOO_LONG',
  evaluation_content_invalid_characters: 'EVALUATION_CONTENT_INVALID_CHARACTERS',
  evaluation_content_required: 'EVALUATION_CONTENT_REQUIRED',
  evaluation_integrity_violation: 'EVALUATION_SERVER_ERROR',
  evaluation_create_key_reused: 'EVALUATION_CREATE_KEY_REUSED',
  evaluation_client_request_required: 'VALIDATION_FAILED',
};

export interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

// The conflict's DETAIL is '{"currentRevision": n}'. Anything else is ignored.
function currentRevisionFrom(details: string | null | undefined): number | undefined {
  if (typeof details !== 'string' || details.length > 200) return undefined;
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>).currentRevision;
      if (Number.isSafeInteger(value) && (value as number) >= 1) return value as number;
    }
  } catch {
    // Not JSON: no structured detail.
  }
  return undefined;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A reused create key's DETAIL is '{"evaluationId": "<uuid>"}' (only when the
// caller is the assigned author of that evaluation). Anything else is ignored.
function evaluationIdFrom(details: string | null | undefined): string | undefined {
  if (typeof details !== 'string' || details.length > 200) return undefined;
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>).evaluationId;
      if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase();
    }
  } catch {
    // Not JSON: no structured detail.
  }
  return undefined;
}

// The evaluation error code for a database error, or undefined when it is not
// one of the expected conditions (then it is reported as a server error).
export function knownEvaluationErrorCode(error: DatabaseErrorLike): EvaluationErrorCode | undefined {
  return (typeof error.code === 'string' ? BY_SQLSTATE[error.code] : undefined)
    ?? (typeof error.message === 'string' ? BY_MESSAGE_KEY[error.message] : undefined);
}

export function evaluationErrorFromDatabase(error: DatabaseErrorLike): HttpException {
  const code = knownEvaluationErrorCode(error) ?? 'EVALUATION_SERVER_ERROR';
  if (code === 'EVALUATION_REVISION_CONFLICT') {
    const currentRevision = currentRevisionFrom(error.details);
    return evaluationError(code, currentRevision === undefined ? {} : { currentRevision });
  }
  if (code === 'EVALUATION_CREATE_KEY_REUSED') {
    const evaluationId = evaluationIdFrom(error.details);
    return evaluationError(code, evaluationId === undefined ? {} : { evaluationId });
  }
  return evaluationError(code);
}

export function throwEvaluationDatabaseError(error: DatabaseErrorLike): never {
  throw evaluationErrorFromDatabase(error);
}
