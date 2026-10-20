import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  SESSION_EXPIRED_MESSAGE: 'session-expired',
  PASSWORD_SETUP_REQUIRED_MESSAGE: 'password-setup-required',
  IDENTITY_MISMATCH_MESSAGE: 'identity-mismatch',
  SESSION_RENEWED_MESSAGE: 'session-renewed',
  authenticatedFetch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => api);
vi.mock('@/config/env', () => ({ env: { apiUrl: 'http://api.test' } }));

import {
  EvaluationRequestError,
  createMentorEvaluation,
  getMyEvaluation,
  publishMentorEvaluation,
  saveMentorEvaluation,
} from './evaluations.service';

const evaluation = {
  id: 'e1', placementId: 'p1', placementStatus: 'ACTIVE', readOnly: false, content: 'Saved text',
  publicationState: 'DRAFT', revision: 2, published: null, authorName: 'Mentor', lastEditorName: 'Mentor', clientRequestId: null,
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function failure(promise: Promise<unknown>): Promise<EvaluationRequestError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(EvaluationRequestError);
  return error as EvaluationRequestError;
}

describe('evaluations service', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('sends exactly content and expectedRevision, uncached', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ ...evaluation, revision: 3 }));
    await saveMentorEvaluation('e1', 'New text', 2);
    const [url, init] = api.authenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/mentor/evaluations/e1');
    expect(init.method).toBe('PUT');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'New text', expectedRevision: 2 });
  });

  it('publish sends only expectedRevision', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ ...evaluation, revision: 3, publicationState: 'PUBLISHED',
      published: { content: 'Saved text', revision: 3, publishedAt: 'x', firstPublishedAt: 'x', publishedByCurrentUser: true, publishedByName: 'Mentor One' } }));
    await publishMentorEvaluation('e1', 2);
    const [url, init] = api.authenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/mentor/evaluations/e1/publish');
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 2 });
  });

  it('does not send a body larger than the server limit (reported as 413, not applied)', async () => {
    const error = await failure(saveMentorEvaluation('e1', '😀'.repeat(30_000), 2));
    expect(api.authenticatedFetch).not.toHaveBeenCalled();
    expect(error).toMatchObject({ outcome: 'not-applied', status: 413, code: 'REQUEST_TOO_LARGE' });
  });

  it('maps an HTTP 413 answer to REQUEST_TOO_LARGE (not applied)', async () => {
    api.authenticatedFetch.mockResolvedValue(new Response('<html>too large</html>', { status: 413 }));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error).toMatchObject({ outcome: 'not-applied', status: 413, code: 'REQUEST_TOO_LARGE' });
  });

  it('reports a revision conflict with the current revision', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ statusCode: 409, code: 'EVALUATION_REVISION_CONFLICT', message: 'x', currentRevision: 5 }, 409));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error).toMatchObject({ outcome: 'not-applied', code: 'EVALUATION_REVISION_CONFLICT', currentRevision: 5 });
  });

  it('treats a network failure as an unknown outcome (never as a failure)', async () => {
    api.authenticatedFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error.outcome).toBe('unknown');
  });

  it('aborts after 30 seconds without an answer and reports an unknown outcome (never retried)', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      api.authenticatedFetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        signal = init.signal ?? undefined;
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const result = failure(saveMentorEvaluation('e1', 'text', 2));
      await vi.advanceTimersByTimeAsync(29_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      expect((await result).outcome).toBe('unknown');
      expect(api.authenticatedFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an unreadable success body as an unknown outcome', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ unexpected: true }));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error.outcome).toBe('unknown');
  });

  it('treats an expired session as not applied', async () => {
    api.authenticatedFetch.mockRejectedValue(new Error('session-expired'));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error).toMatchObject({ outcome: 'not-applied', code: 'SESSION_EXPIRED' });
  });

  it('an identity mismatch is reported as not applied (nothing was sent)', async () => {
    api.authenticatedFetch.mockRejectedValue(new Error('identity-mismatch'));
    const error = await failure(saveMentorEvaluation('e1', 'text', 2));
    expect(error).toMatchObject({ outcome: 'not-applied', code: 'IDENTITY_MISMATCH' });
  });

  it('create sends exactly the text and the operation key', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ ...evaluation, revision: 1, clientRequestId: '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b' }));
    await createMentorEvaluation('p1', '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b', ' Text ');
    const [url, init] = api.authenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/mentor/placements/p1/evaluations');
    expect(JSON.parse(init.body as string)).toEqual({ content: ' Text ', clientRequestId: '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b' });
  });

  it('a reused create key carries the existing evaluation id only when it is a valid id', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    api.authenticatedFetch.mockResolvedValueOnce(json({ statusCode: 409, code: 'EVALUATION_CREATE_KEY_REUSED', message: 'x', evaluationId: id }, 409));
    expect(await failure(createMentorEvaluation('p1', id, 'x'))).toMatchObject({
      outcome: 'not-applied', code: 'EVALUATION_CREATE_KEY_REUSED', evaluationId: id,
    });
    api.authenticatedFetch.mockResolvedValueOnce(json({ statusCode: 409, code: 'EVALUATION_CREATE_KEY_REUSED', message: 'x', evaluationId: '../x' }, 409));
    expect((await failure(createMentorEvaluation('p1', id, 'x'))).evaluationId).toBeUndefined();
  });

  it('a 401 for an older token of a renewed sign-in is reported as not applied', async () => {
    api.authenticatedFetch.mockRejectedValue(new Error('session-renewed'));
    expect(await failure(saveMentorEvaluation('e1', 'text', 2))).toMatchObject({ outcome: 'not-applied', code: 'SESSION_RENEWED' });
  });

  it('refuses a mentor response without the attribution fields as an unknown outcome', async () => {
    const withoutKey: Record<string, unknown> = { ...evaluation };
    delete withoutKey.clientRequestId;
    api.authenticatedFetch.mockResolvedValue(json(withoutKey));
    expect((await failure(saveMentorEvaluation('e1', 'text', 2))).outcome).toBe('unknown');
  });

  it('never exposes database details: only the error code is kept', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ statusCode: 500, code: 'EVALUATION_SERVER_ERROR', message: 'relation x does not exist' }, 500));
    const error = await failure(getMyEvaluation('e1'));
    expect(error.code).toBe('EVALUATION_SERVER_ERROR');
    expect(error.message).not.toContain('relation');
  });
});
