import { env } from '@/config/env';
import {
  IDENTITY_MISMATCH_MESSAGE,
  PASSWORD_SETUP_REQUIRED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  SESSION_RENEWED_MESSAGE,
  authenticatedFetch,
} from '@/lib/api-client';

import { REQUEST_BODY_LIMIT_BYTES } from './content-rules';
import type { InternEvaluation, MentorEvaluation } from './types';

// Outcome of a failed request:
// - 'not-applied': the server answered with an error (or the request was never
//   sent), so nothing was changed.
// - 'unknown': no trustworthy answer (network failure, timeout, unreadable
//   success body). The write may or may not have happened. Never treat this
//   as a failure, and never retry it automatically.
export type EvaluationRequestOutcome = 'not-applied' | 'unknown';

export class EvaluationRequestError extends Error {
  readonly outcome: EvaluationRequestOutcome;
  readonly status: number | null;
  readonly code: string | undefined;
  readonly currentRevision: number | undefined;
  // For EVALUATION_CREATE_KEY_REUSED: the evaluation an earlier request of the
  // same create operation already made (the caller is its assigned author).
  readonly evaluationId: string | undefined;

  constructor(options: {
    outcome: EvaluationRequestOutcome; status?: number | null; code?: string; currentRevision?: number; evaluationId?: string;
  }) {
    super(options.code ?? options.outcome);
    this.name = 'EvaluationRequestError';
    this.outcome = options.outcome;
    this.status = options.status ?? null;
    this.code = options.code;
    this.currentRevision = options.currentRevision;
    this.evaluationId = options.evaluationId;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUEST_TIMEOUT_MS = 30_000;

function codeForStatus(status: number): string {
  if (status === 401) return 'SESSION_EXPIRED';
  if (status === 403) return 'EVALUATION_ACCESS_DENIED';
  if (status === 404) return 'EVALUATION_NOT_FOUND';
  if (status === 413) return 'REQUEST_TOO_LARGE';
  if (status === 409) return 'EVALUATION_REVISION_CONFLICT';
  return 'REQUEST_FAILED';
}

async function request<T>(path: string, init: RequestInit, isValid: (value: unknown) => value is T): Promise<T> {
  if (typeof init.body === 'string' && new TextEncoder().encode(init.body).length > REQUEST_BODY_LIMIT_BYTES) {
    // Never sent: the server would refuse it (413).
    throw new EvaluationRequestError({ outcome: 'not-applied', status: 413, code: 'REQUEST_TOO_LARGE' });
  }

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
    // authenticatedFetch refuses to send without a session, and clears the
    // session on a 401 answer: in both cases nothing was changed.
    if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
      throw new EvaluationRequestError({ outcome: 'not-applied', status: 401, code: 'SESSION_EXPIRED' });
    }
    if (error instanceof Error && error.message === PASSWORD_SETUP_REQUIRED_MESSAGE) {
      throw new EvaluationRequestError({ outcome: 'not-applied', status: 403, code: 'PASSWORD_SETUP_REQUIRED' });
    }
    // Not applied: the stored session belongs to another user than this tab
    // shows (never sent, or answered 401 for the previous user).
    if (error instanceof Error && error.message === IDENTITY_MISMATCH_MESSAGE) {
      throw new EvaluationRequestError({ outcome: 'not-applied', code: 'IDENTITY_MISMATCH' });
    }
    // Not applied: refused (401) for an older token of this user, whose sign-in
    // has been renewed meanwhile. The session is kept.
    if (error instanceof Error && error.message === SESSION_RENEWED_MESSAGE) {
      throw new EvaluationRequestError({ outcome: 'not-applied', status: 401, code: 'SESSION_RENEWED' });
    }
    // Network failure, timeout or abort: the request may have reached the server.
    throw new EvaluationRequestError({ outcome: 'unknown' });
  }

  try {
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown; currentRevision?: unknown; evaluationId?: unknown } | null;
      const code = typeof body?.code === 'string' && body.code !== '' ? body.code : codeForStatus(response.status);
      const currentRevision = Number.isSafeInteger(body?.currentRevision) ? (body?.currentRevision as number) : undefined;
      const evaluationId = typeof body?.evaluationId === 'string' && UUID_PATTERN.test(body.evaluationId) ? body.evaluationId : undefined;
      throw new EvaluationRequestError({
        outcome: 'not-applied', status: response.status, code: response.status === 413 ? 'REQUEST_TOO_LARGE' : code,
        currentRevision, evaluationId,
      });
    }
    const value: unknown = await response.json().catch(() => undefined);
    if (!isValid(value)) {
      // The server reported success, but the result cannot be read or trusted.
      throw new EvaluationRequestError({ outcome: 'unknown', status: response.status });
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---- Mentor ---------------------------------------------------------------

export function listMentorEvaluations(placementId: string): Promise<MentorEvaluation[]> {
  return request(`/mentor/placements/${encodeURIComponent(placementId)}/evaluations`, json('GET'), isMentorEvaluationList);
}

export function getMentorEvaluation(evaluationId: string): Promise<MentorEvaluation> {
  return request(`/mentor/evaluations/${encodeURIComponent(evaluationId)}`, json('GET'), isMentorEvaluation);
}

// clientRequestId identifies one create operation: the same value for every
// retry, so the server never creates a second evaluation for it.
export function createMentorEvaluation(placementId: string, clientRequestId: string, content: string): Promise<MentorEvaluation> {
  return request(`/mentor/placements/${encodeURIComponent(placementId)}/evaluations`, json('POST', { content, clientRequestId }), isMentorEvaluation);
}

export function saveMentorEvaluation(evaluationId: string, content: string, expectedRevision: number): Promise<MentorEvaluation> {
  return request(`/mentor/evaluations/${encodeURIComponent(evaluationId)}`, json('PUT', { content, expectedRevision }), isMentorEvaluation);
}

export function publishMentorEvaluation(evaluationId: string, expectedRevision: number): Promise<MentorEvaluation> {
  return request(`/mentor/evaluations/${encodeURIComponent(evaluationId)}/publish`, json('POST', { expectedRevision }), isMentorEvaluation);
}

// ---- Intern ---------------------------------------------------------------

export function listMyEvaluations(): Promise<InternEvaluation[]> {
  return request('/intern/me/evaluations', json('GET'), isInternEvaluationList);
}

export function getMyEvaluation(evaluationId: string): Promise<InternEvaluation> {
  return request(`/intern/me/evaluations/${encodeURIComponent(evaluationId)}`, json('GET'), isInternEvaluation);
}

// ---- Response checks --------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isRevision = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1;
const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const PLACEMENT_STATUSES = ['ACTIVE', 'COMPLETED'];

function isMentorEvaluation(value: unknown): value is MentorEvaluation {
  if (!isObject(value)) return false;
  if (!['id', 'placementId', 'createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string')) return false;
  if (!PLACEMENT_STATUSES.includes(String(value.placementStatus)) || typeof value.readOnly !== 'boolean') return false;
  if (typeof value.content !== 'string' || !isRevision(value.revision)) return false;
  if (!['DRAFT', 'UNPUBLISHED_CHANGES', 'PUBLISHED'].includes(String(value.publicationState))) return false;
  if (!isNullableString(value.authorName) || !isNullableString(value.lastEditorName)) return false;
  if (!isNullableString(value.clientRequestId)) return false;
  if (value.publicationState === 'DRAFT') return value.published === null;
  const published = value.published;
  return isObject(published)
    && typeof published.content === 'string'
    && isRevision(published.revision)
    && typeof published.publishedAt === 'string'
    && typeof published.firstPublishedAt === 'string'
    && typeof published.publishedByCurrentUser === 'boolean'
    && isNullableString(published.publishedByName);
}

function isMentorEvaluationList(value: unknown): value is MentorEvaluation[] {
  return Array.isArray(value) && value.every(isMentorEvaluation);
}

function isInternEvaluation(value: unknown): value is InternEvaluation {
  return isObject(value)
    && ['id', 'placementId', 'trainingTitle', 'company', 'content', 'publishedAt'].every((key) => typeof value[key] === 'string')
    && PLACEMENT_STATUSES.includes(String(value.placementStatus))
    && isNullableString(value.authorName)
    && isNullableString(value.publishedByName);
}

function isInternEvaluationList(value: unknown): value is InternEvaluation[] {
  return Array.isArray(value) && value.every(isInternEvaluation);
}
