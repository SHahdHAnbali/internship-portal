// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));
vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }));
const navigation = vi.hoisted(() => ({ navigateTo: vi.fn() }));
vi.mock('@/lib/browser-navigation', () => navigation);

import {
  IDENTITY_MISMATCH_MESSAGE, PASSWORD_SETUP_REQUIRED_MESSAGE, SESSION_EXPIRED_MESSAGE, SESSION_RENEWED_MESSAGE, authenticatedFetch,
} from './api-client';
import { setSignedInUserId } from './auth-identity';

describe('authenticatedFetch', () => {
  // The tab shows user-1 as signed in (AuthProvider reports this).
  beforeEach(() => { setSignedInUserId('user-1'); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('sends the current access token', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } }, error: null });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await authenticatedFetch('http://api.test/x');
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('on a 401 ends only this browser\'s session (never a global sign-out)', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not sign out on a 403 (an authorization refusal, not an invalid session)', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const response = await authenticatedFetch('http://api.test/x');
    expect(response.status).toBe(403);
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('sends a user whose password setup is pending to /set-password, without signing out', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      statusCode: 403, error: 'Forbidden', code: 'PASSWORD_SETUP_REQUIRED', message: 'Set a password before using the portal.',
    }), { status: 403 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(PASSWORD_SETUP_REQUIRED_MESSAGE);
    expect(navigation.navigateTo).toHaveBeenCalledWith('/set-password');
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('leaves other 403 responses (wrong role, deactivated) to the caller', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ statusCode: 403, message: 'This account has been deactivated' }), { status: 403 })));
    const response = await authenticatedFetch('http://api.test/x');
    expect(response.status).toBe(403);
    expect(navigation.navigateTo).not.toHaveBeenCalled();
  });

  it('refuses to call the API without a session', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('authenticatedFetch: the session must belong to the user this tab shows', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); setSignedInUserId(null); });

  const sessionOf = (userId: string | undefined) => ({
    data: { session: { access_token: 'secret-token-value', user: userId === undefined ? undefined : { id: userId } } }, error: null,
  });

  it('sends the request when the identities agree', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf('user-1'));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await authenticatedFetch('http://api.test/x')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('another tab signed in as someone else: refuses without sending, signing out or exposing the token', async () => {
    setSignedInUserId('user-1'); // this tab still shows user-1
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf('user-2')); // shared storage now holds user-2
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = await authenticatedFetch('http://api.test/x', { method: 'PUT', body: '{}' }).then(() => null, (reason: Error) => reason);
    expect(error?.message).toBe(IDENTITY_MISMATCH_MESSAGE);
    expect(error?.message).not.toContain('secret-token-value');
    expect(error?.message).not.toContain('user-2');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled(); // user-2's sign-in stays intact
    expect(navigation.navigateTo).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses when this tab shows nobody signed in but a session exists (signed in elsewhere)', async () => {
    setSignedInUserId(null);
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf('user-2'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(IDENTITY_MISMATCH_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when the session has no user identity to compare', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf(undefined));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(IDENTITY_MISMATCH_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a session that has ended still reports session expiry (unchanged)', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('works again once this tab has caught up with the new sign-in', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf('user-2'));
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(IDENTITY_MISMATCH_MESSAGE);
    setSignedInUserId('user-2'); // the auth event arrived
    expect((await authenticatedFetch('http://api.test/x')).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('authenticatedFetch: a 401 signs out only the user who sent the request', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); setSignedInUserId(null); });

  const sessionOf = (userId: string) => ({ data: { session: { access_token: `token-of-${userId}`, user: { id: userId } } }, error: null });

  it('a 401 for the still-current user signs this browser out (session expired)', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValueOnce(sessionOf('user-1')).mockResolvedValueOnce(sessionOf('user-1'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('a late 401 after another user signed in keeps the newer sign-in and exposes no ids or tokens', async () => {
    setSignedInUserId('user-1');
    let answer!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; })));
    mock.supabase.auth.getSession.mockResolvedValueOnce(sessionOf('user-1'));
    const request = authenticatedFetch('http://api.test/x').then(() => null, (reason: Error) => reason);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    // Meanwhile user-2 signed in (this tab or another); then user-1's request answers 401.
    mock.supabase.auth.getSession.mockResolvedValue(sessionOf('user-2'));
    setSignedInUserId('user-2');
    answer(new Response('{}', { status: 401 }));
    const error = await request;
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
    expect(error?.message).toBe(IDENTITY_MISMATCH_MESSAGE);
    for (const secret of ['user-1', 'user-2', 'token-of-user-1', 'token-of-user-2']) expect(error?.message).not.toContain(secret);
  });

  it('a 401 when no session is stored any more reports expiry without another sign-out', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValueOnce(sessionOf('user-1')).mockResolvedValueOnce({ data: { session: null }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('authenticatedFetch: a 401 for an older token of the same user', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); setSignedInUserId(null); });

  it('keeps the renewed session (no sign-out) and reports that nothing was changed', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'old-token', user: { id: 'user-1' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'renewed-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const error = await authenticatedFetch('http://api.test/x').then(() => null, (reason: Error) => reason);
    expect(error?.message).toBe(SESSION_RENEWED_MESSAGE);
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
    for (const secret of ['old-token', 'renewed-token', 'user-1']) expect(error?.message).not.toContain(secret);
  });

  it('still signs out when the stored token is the one that was refused (genuine expiry)', async () => {
    setSignedInUserId('user-1');
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'same-token', user: { id: 'user-1' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
