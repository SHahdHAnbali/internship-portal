// @vitest-environment jsdom
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProfileResult = { data: { role: string; full_name: string | null; is_active: boolean; password_set_at: string | null } | null; error: unknown };

const mock = vi.hoisted(() => {
  const state = {
    listener: null as null | ((event: string, session: unknown) => void),
    profiles: new Map<string, ProfileResult>(),
  };
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        state.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async (): Promise<{ data: { session: unknown }; error: unknown }> => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(() => {
      let userId = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => { userId = value; return query; },
        maybeSingle: async () => state.profiles.get(userId) ?? { data: null, error: null },
      };
      return query;
    }),
  };
  return { state, supabase };
});
vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }));

import { IDENTITY_MISMATCH_MESSAGE, authenticatedFetch } from '@/lib/api-client';
import { getSignedInUserId } from '@/lib/auth-identity';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';
import RoleGuard from './RoleGuard';

const mentor = (fullName: string): ProfileResult => ({
  data: { role: 'MENTOR', full_name: fullName, is_active: true, password_set_at: '2026-10-01T00:00:00Z' }, error: null,
});
const session = (userId: string) => ({ user: { id: userId }, access_token: 'test-access', refresh_token: 'test-refresh' });

// What the private page rendered, as "<signed-in user>:<data shown>".
let renders: string[] = [];
// The server answers with the data of whoever is signed in now.
let serverUser = '';

// Like the evaluation pages before user-scoped keys: one shared query key.
function PrivatePage() {
  const { user, signOut } = useAuth();
  const query = useQuery({ queryKey: ['private-data'], queryFn: async () => `secret of ${serverUser}`, staleTime: Infinity });
  renders.push(`${user?.id}:${query.data ?? '-'}`);
  return (
    <div>
      <p>{query.data ?? 'loading'}</p>
      <button type="button" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

function renderApp() {
  return render(
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/mentor']}>
          <Routes>
            <Route path="/login" element={<p>Sign in page</p>} />
            <Route path="/mentor" element={<RoleGuard allowedRoles={['MENTOR']}><PrivatePage /></RoleGuard>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );
}

function emit(event: string, value: unknown) {
  act(() => { mock.state.listener?.(event, value); });
}

async function signInAs(event: string, userId: string) {
  serverUser = userId;
  emit(event, session(userId));
}

describe('AuthProvider: query cache isolation between users', () => {
  beforeEach(() => {
    renders = [];
    mock.state.listener = null;
    mock.state.profiles.set('u-a', mentor('Mentor A'));
    mock.state.profiles.set('u-b', mentor('Mentor B'));
  });
  afterEach(() => { cleanup(); queryClient.clear(); vi.clearAllMocks(); window.sessionStorage.clear(); });

  it('never renders the previous user\'s cached data after another account signs in', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(await screen.findByText('secret of u-a')).toBeTruthy();

    renders = [];
    await signInAs('SIGNED_IN', 'u-b'); // e.g. another account in this tab
    expect(await screen.findByText('secret of u-b')).toBeTruthy();
    expect(renders.some((entry) => entry.includes('secret of u-a'))).toBe(false);
    expect(queryClient.getQueryData(['private-data'])).toBe('secret of u-b');
  });

  it('reports the signed-in user to the API client\'s identity check, as soon as the auth event arrives', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(getSignedInUserId()).toBe('u-a');
    emit('TOKEN_REFRESHED', session('u-a'));
    expect(getSignedInUserId()).toBe('u-a');
    await signInAs('SIGNED_IN', 'u-b'); // e.g. relayed from another tab
    expect(getSignedInUserId()).toBe('u-b');
    emit('SIGNED_OUT', null);
    expect(getSignedInUserId()).toBeNull();
  });

  it('cross-tab: a request is not sent while the stored session is another tab\'s newer sign-in', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderApp();
      await signInAs('INITIAL_SESSION', 'u-a');
      expect(await screen.findByText('secret of u-a')).toBeTruthy();
      mock.supabase.auth.getSession.mockResolvedValue({ data: { session: session('u-a') }, error: null });
      await authenticatedFetch('http://api.test/mentor/placements');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Another tab signed in as u-b: the shared storage changed, this tab has no event yet.
      mock.supabase.auth.getSession.mockResolvedValue({ data: { session: session('u-b') }, error: null });
      await expect(authenticatedFetch('http://api.test/mentor/placements')).rejects.toThrow(IDENTITY_MISMATCH_MESSAGE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mock.supabase.auth.signOut).not.toHaveBeenCalled();
      expect(screen.getByText('secret of u-a')).toBeTruthy(); // nothing of u-b reached this page

      // The relayed event arrives: the cache is cleared and requests work as u-b.
      await signInAs('SIGNED_IN', 'u-b');
      expect(await screen.findByText('secret of u-b')).toBeTruthy();
      await authenticatedFetch('http://api.test/mentor/placements');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('records no signed-in user after sign-out', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(await screen.findByText('secret of u-a')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
    expect(getSignedInUserId()).toBeNull();
  });

  it('keeps the cache for a token refresh or a repeated sign-in event of the same user', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(await screen.findByText('secret of u-a')).toBeTruthy();
    const clear = vi.spyOn(queryClient, 'clear');
    emit('TOKEN_REFRESHED', session('u-a'));
    emit('SIGNED_IN', session('u-a'));
    expect(clear).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['private-data'])).toBe('secret of u-a');
  });

  it('clears the cache on sign-out', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(await screen.findByText('secret of u-a')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
    expect(await screen.findByText('Sign in page')).toBeTruthy();
    expect(queryClient.getQueryData(['private-data'])).toBeUndefined();
  });

  it('clears the cache when the session ends (SIGNED_OUT, as after a 401 or an expired session)', async () => {
    renderApp();
    await signInAs('INITIAL_SESSION', 'u-a');
    expect(await screen.findByText('secret of u-a')).toBeTruthy();
    emit('SIGNED_OUT', null);
    expect(await screen.findByText('Sign in page')).toBeTruthy();
    expect(queryClient.getQueryData(['private-data'])).toBeUndefined();
  });
});
