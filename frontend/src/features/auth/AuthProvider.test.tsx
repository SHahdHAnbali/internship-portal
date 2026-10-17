// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ProfileRow = { role: string; full_name: string | null; is_active: boolean; password_set_at?: string | null } | null;
type ProfileResult = { data: ProfileRow; error: unknown };

const mock = vi.hoisted(() => {
  const state = {
    listener: null as null | ((event: string, session: unknown) => void),
    // Per-user profile results; a pending entry is resolved by the test, and a
    // function receives the selected columns.
    profiles: new Map<string, ProfileResult | Promise<ProfileResult> | ((columns: string) => ProfileResult)>(),
  };
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        state.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(() => {
      let userId = '';
      let columns = '';
      const query = {
        select: (selected: string) => { columns = selected; return query; },
        eq: (_column: string, value: string) => { userId = value; return query; },
        maybeSingle: async () => {
          const entry = state.profiles.get(userId) ?? { data: null, error: null };
          return typeof entry === 'function' ? entry(columns) : entry;
        },
      };
      return query;
    }),
  };
  return { state, supabase };
});
vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }));

import { AuthProvider } from './AuthProvider';
import { useAuth } from './auth-context';
import Login from './Login';
import RoleGuard from './RoleGuard';

const SET_AT = '2026-10-01T00:00:00Z';

function session(userId: string) {
  // Only the fields the provider reads; no real token values.
  return { user: { id: userId }, access_token: 'test-access', refresh_token: 'test-refresh' };
}

function emit(event: string, value: unknown) {
  act(() => { mock.state.listener?.(event, value); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function SignOutButton() {
  const { signOut } = useAuth();
  return <button type="button" onClick={() => void signOut()}>Sign out</button>;
}

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/hr/dashboard" element={<RoleGuard allowedRoles={['HR']}><p>HR home</p><SignOutButton /></RoleGuard>} />
          <Route path="/admin/dashboard" element={<p>Admin home</p>} />
          <Route path="/mentor" element={<p>Mentor home</p>} />
          <Route path="/intern" element={<p>Intern home</p>} />
          <Route path="/applicant/profile" element={<p>Applicant home</p>} />
          <Route path="/set-password" element={<p>Set password page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const emailField = () => screen.queryByLabelText('Email address');
const noAccessMessage = /does not have active portal access/;

describe('AuthProvider, Login and RoleGuard: returning users', () => {
  beforeEach(() => { mock.state.listener = null; mock.state.profiles.clear(); window.sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('restores a persisted session and goes straight to the role page without showing the email form', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: 'HR', is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/login');
    // Before Supabase reports the restored session: a spinner, never the form.
    expect(screen.getByRole('status', { name: 'Checking your sign-in' })).toBeTruthy();
    expect(emailField()).toBeNull();

    emit('INITIAL_SESSION', session('u-hr'));
    expect(emailField()).toBeNull();
    expect(await screen.findByText('HR home')).toBeTruthy();
    expect(mock.supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ADMIN', 'Admin home'],
    ['HR', 'HR home'],
    ['MENTOR', 'Mentor home'],
    ['INTERN', 'Intern home'],
    ['APPLICANT', 'Applicant home'],
  ])('routes a returning %s to their own page', async (role, page) => {
    mock.state.profiles.set('u1', { data: { role, full_name: null, is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/login');
    emit('INITIAL_SESSION', session('u1'));
    expect(await screen.findByText(page)).toBeTruthy();
  });

  it('shows the email form when there is no session and sends protected routes to sign-in', async () => {
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', null);
    expect(await screen.findByLabelText('Email address')).toBeTruthy();
    expect(screen.queryByText('HR home')).toBeNull();
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it('keeps a deactivated account out of every portal', async () => {
    mock.state.profiles.set('u-off', { data: { role: 'HR', full_name: null, is_active: false, password_set_at: SET_AT }, error: null });
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-off'));
    expect(await screen.findByText(noAccessMessage)).toBeTruthy();
    expect(screen.queryByText('HR home')).toBeNull();
  });

  it('does not flash the no-access message or the form while a new sign-in loads its role', async () => {
    const pending = deferred<ProfileResult>();
    mock.state.profiles.set('u-new', pending.promise);
    renderAt('/login');
    emit('INITIAL_SESSION', null);
    expect(await screen.findByLabelText('Email address')).toBeTruthy();

    emit('SIGNED_IN', session('u-new'));
    await waitFor(() => expect(emailField()).toBeNull());
    expect(screen.queryByText(noAccessMessage)).toBeNull();

    await act(async () => { pending.resolve({ data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null }); });
    expect(await screen.findByText('HR home')).toBeTruthy();
  });

  it('ignores a stale profile result after the session ended', async () => {
    const pending = deferred<ProfileResult>();
    mock.state.profiles.set('u-old', pending.promise);
    renderAt('/login');
    emit('INITIAL_SESSION', session('u-old'));
    await waitFor(() => expect(mock.supabase.from).toHaveBeenCalledTimes(1));

    emit('SIGNED_OUT', null);
    expect(await screen.findByLabelText('Email address')).toBeTruthy();
    await act(async () => { pending.resolve({ data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null }); });
    // The late HR result must not sign the visitor back in.
    expect(screen.queryByText('HR home')).toBeNull();
    expect(emailField()).toBeTruthy();
  });

  it('refreshes the token in the background without sending the user back to sign-in', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: 'HR', is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-hr'));
    expect(await screen.findByText('HR home')).toBeTruthy();

    emit('TOKEN_REFRESHED', session('u-hr'));
    expect(screen.getByText('HR home')).toBeTruthy();
    expect(emailField()).toBeNull();
  });

  it('sends a first-time user (no password yet) to Set Password, from /login and from portal pages', async () => {
    mock.state.profiles.set('u-new', { data: { role: 'INTERN', full_name: null, is_active: true, password_set_at: null }, error: null });
    renderAt('/login');
    emit('INITIAL_SESSION', session('u-new'));
    expect(await screen.findByText('Set password page')).toBeTruthy();
    cleanup();

    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: null, is_active: true, password_set_at: null }, error: null });
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-hr'));
    expect(await screen.findByText('Set password page')).toBeTruthy();
    expect(screen.queryByText('HR home')).toBeNull();
  });

  it('sends a password-reset link to Set Password even when a password exists', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/login');
    emit('PASSWORD_RECOVERY', session('u-hr'));
    expect(await screen.findByText('Set password page')).toBeTruthy();
  });

  it('stays in recovery mode after a refresh of the same tab, and stores only the user id', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/login');
    emit('INITIAL_SESSION', session('u-hr'));
    emit('PASSWORD_RECOVERY', session('u-hr'));
    expect(await screen.findByText('Set password page')).toBeTruthy();
    expect(Object.values({ ...window.sessionStorage })).toEqual(['u-hr']);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('test-access');
    cleanup();

    // Refresh: Supabase restores the session and reports INITIAL_SESSION only.
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-hr'));
    expect(await screen.findByText('Set password page')).toBeTruthy();
    emit('TOKEN_REFRESHED', session('u-hr'));
    expect(screen.getByText('Set password page')).toBeTruthy();
  });

  it('drops recovery mode when another user signs in or on sign-out', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null });
    mock.state.profiles.set('u-other', { data: { role: 'HR', full_name: null, is_active: true, password_set_at: SET_AT }, error: null });
    window.sessionStorage.setItem('portal.passwordRecoveryUser', 'u-hr');
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-other'));
    expect(await screen.findByText('HR home')).toBeTruthy();
    expect(window.sessionStorage.length).toBe(0);
    cleanup();

    window.sessionStorage.setItem('portal.passwordRecoveryUser', 'u-hr');
    renderAt('/login');
    emit('SIGNED_OUT', null);
    expect(await screen.findByLabelText('Email address')).toBeTruthy();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('keeps sign-in working before the password_set_at migration is applied', async () => {
    mock.state.profiles.set('u-hr', (columns: string) => (columns.includes('password_set_at')
      ? { data: null, error: { code: '42703', message: 'column does not exist' } }
      : { data: { role: 'HR', full_name: null, is_active: true }, error: null }));
    renderAt('/login');
    emit('INITIAL_SESSION', session('u-hr'));
    expect(await screen.findByText('HR home')).toBeTruthy();
    expect(mock.supabase.from).toHaveBeenCalledTimes(2);
  });

  it('signs out this browser only, then shows sign-in', async () => {
    mock.state.profiles.set('u-hr', { data: { role: 'HR', full_name: 'HR', is_active: true, password_set_at: SET_AT }, error: null });
    renderAt('/hr/dashboard');
    emit('INITIAL_SESSION', session('u-hr'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mock.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(await screen.findByLabelText('Email address')).toBeTruthy();
  });
});
