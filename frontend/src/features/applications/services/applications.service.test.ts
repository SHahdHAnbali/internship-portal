import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authenticatedFetch: vi.fn(),
}));
vi.mock('@/config/env', () => ({ env: { apiUrl: 'http://api' } }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  authenticatedFetch: mocks.authenticatedFetch,
}));

import {
  getApplicationEligibility,
  PREVIOUS_APPLICATION_EXISTS,
  ReviewSubmissionError,
  submitApplication,
} from './applications.service';

const cv = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('submitApplication and the one-application rule', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('uploads as the signed-in account when there is a session, anonymously otherwise', async () => {
    const fetchMock = vi.fn(async () => json(201, { applicationId: 'a', status: 'DRAFT', message: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    mocks.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'token-1' } } });
    await submitApplication('i1', null, cv);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers).get('Authorization')).toBe('Bearer token-1');

    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    await submitApplication('i1', null, cv);
    expect(((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Headers).get('Authorization')).toBeNull();
  });

  it('carries the server code when the applicant has already applied', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { code: PREVIOUS_APPLICATION_EXISTS, message: 'You have already submitted an application.' })));
    const error = await submitApplication('i1', null, cv).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewSubmissionError);
    expect((error as ReviewSubmissionError).code).toBe(PREVIOUS_APPLICATION_EXISTS);
    expect((error as Error).message).toBe('You have already submitted an application.');
  });

  it('keeps validation messages readable', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { message: ['internshipId must be a UUID'] })));
    await expect(submitApplication('nope', null, cv)).rejects.toThrow('internshipId must be a UUID');
  });
});

describe('getApplicationEligibility', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('asks with the signed-in session and returns the answer', async () => {
    mocks.authenticatedFetch.mockResolvedValue(json(200, { canApply: false }));
    await expect(getApplicationEligibility()).resolves.toEqual({ canApply: false });
    expect(mocks.authenticatedFetch).toHaveBeenCalledWith('http://api/applications/eligibility');
  });

  it('fails instead of guessing on an error or a malformed answer', async () => {
    mocks.authenticatedFetch.mockResolvedValueOnce(json(500, { message: 'boom' }));
    await expect(getApplicationEligibility()).rejects.toThrow();
    mocks.authenticatedFetch.mockResolvedValueOnce(json(200, {}));
    await expect(getApplicationEligibility()).rejects.toThrow('Unable to check whether you can apply.');
  });
});
