// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => {
  const state = {
    listener: null as null | ((event: string, session: unknown) => void),
    profile: { data: { role: 'HR', full_name: null, is_active: true, password_set_at: '2026-10-01T00:00:00Z' }, error: null } as unknown,
  };
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        state.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null as unknown })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null as unknown })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(() => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => state.profile };
      return query;
    }),
  };
  return { state, supabase };
});
vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }));

import { AuthProvider } from './AuthProvider';
import Login from './Login';

function emit(event: string, value: unknown) {
  act(() => { mock.state.listener?.(event, value); });
}

function renderLogin() {
  const view = render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/hr/dashboard" element={<p>HR home</p>} />
          <Route path="/set-password" element={<p>Set password page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  emit('INITIAL_SESSION', null);
  return view;
}

async function fill(email: string, password?: string) {
  fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: email } });
  if (password !== undefined) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

const neverSentEmail = () => {
  expect(mock.supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  expect(mock.supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
};

describe('Login: password sign-in', () => {
  beforeEach(() => { mock.state.listener = null; window.history.replaceState(null, '', '/'); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('signs a returning user in with email and password, sends no email, then routes by role', async () => {
    renderLogin();
    await fill('  Person@Example.TEST ', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mock.supabase.auth.signInWithPassword)
      .toHaveBeenCalledWith({ email: 'person@example.test', password: 'correct horse battery' }));
    neverSentEmail();

    emit('SIGNED_IN', { user: { id: 'u-hr' } });
    expect(await screen.findByText('HR home')).toBeTruthy();
  });

  it('sends a signed-in person who has not set a password yet to Set Password', async () => {
    mock.state.profile = { data: { role: 'HR', full_name: null, is_active: true, password_set_at: null }, error: null };
    renderLogin();
    emit('SIGNED_IN', { user: { id: 'u-hr' } });
    expect(await screen.findByText('Set password page')).toBeTruthy();
    mock.state.profile = { data: { role: 'HR', full_name: null, is_active: true, password_set_at: '2026-10-01T00:00:00Z' }, error: null };
  });

  it.each([
    [{ code: 'invalid_credentials', status: 400 }, /email or password is incorrect/],
    [{ code: 'email_not_confirmed', status: 400 }, /not verified yet/],
    [{ code: 'over_request_rate_limit', status: 429 }, /Too many sign-in attempts/],
    [{ code: 'unexpected_failure', status: 500, message: 'internal detail' }, /We could not sign you in/],
  ])('shows a safe message for %o', async (authError, message) => {
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: authError });
    renderLogin();
    await fill('person@example.test', 'wrong password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
    expect(screen.getByRole('alert').textContent).not.toContain('internal detail');
    neverSentEmail();
  });

  it('asks for both fields before calling Supabase', async () => {
    renderLogin();
    await fill('person@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/email address and password/);
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('Login: explicit email actions', () => {
  beforeEach(() => { mock.state.listener = null; window.history.replaceState(null, '', '/'); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('sends a one-time link only when asked, never creating an account', async () => {
    renderLogin();
    await fill('person@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a one-time sign-in link' }));
    await waitFor(() => expect(mock.supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.test',
      options: { emailRedirectTo: `${window.location.origin}/login`, shouldCreateUser: false },
    }));
    expect(await screen.findByText(/If an account exists for this address, we sent a one-time sign-in link/)).toBeTruthy();
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('does not reveal whether an account exists', async () => {
    mock.supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { code: 'otp_disabled', status: 422, message: 'Signups not allowed for otp' } });
    renderLogin();
    await fill('nobody@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a one-time sign-in link' }));
    expect(await screen.findByText(/If an account exists for this address/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a real sending failure without claiming success', async () => {
    mock.supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 0, message: 'network' } });
    renderLogin();
    await fill('person@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Email me a one-time sign-in link' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not send the email/);
    expect(screen.queryByText(/Check your email/)).toBeNull();
  });

  it('requests a password reset email that returns to /login', async () => {
    renderLogin();
    await fill('person@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await waitFor(() => expect(mock.supabase.auth.resetPasswordForEmail)
      .toHaveBeenCalledWith('person@example.test', { redirectTo: `${window.location.origin}/login` }));
    expect(await screen.findByText(/we sent a link to reset your password/)).toBeTruthy();
    expect(mock.supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('needs an email address before sending anything', async () => {
    renderLogin();
    fireEvent.click(await screen.findByRole('button', { name: 'Forgot password?' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Enter your email address first/);
    neverSentEmail();
  });

  it('explains an expired or invalid email link and clears it from the address bar', async () => {
    window.history.replaceState(null, '', '/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    renderLogin();
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired or was already used/);
    expect(window.location.hash).toBe('');
  });
});
