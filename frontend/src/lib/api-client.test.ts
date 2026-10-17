// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { PASSWORD_SETUP_REQUIRED_MESSAGE, SESSION_EXPIRED_MESSAGE, authenticatedFetch } from './api-client';

describe('authenticatedFetch', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('sends the current access token', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await authenticatedFetch('http://api.test/x');
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('on a 401 ends only this browser\'s session (never a global sign-out)', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mock.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not sign out on a 403 (an authorization refusal, not an invalid session)', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const response = await authenticatedFetch('http://api.test/x');
    expect(response.status).toBe(403);
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('sends a user whose password setup is pending to /set-password, without signing out', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      statusCode: 403, error: 'Forbidden', code: 'PASSWORD_SETUP_REQUIRED', message: 'Set a password before using the portal.',
    }), { status: 403 })));
    await expect(authenticatedFetch('http://api.test/x')).rejects.toThrow(PASSWORD_SETUP_REQUIRED_MESSAGE);
    expect(navigation.navigateTo).toHaveBeenCalledWith('/set-password');
    expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('leaves other 403 responses (wrong role, deactivated) to the caller', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
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
