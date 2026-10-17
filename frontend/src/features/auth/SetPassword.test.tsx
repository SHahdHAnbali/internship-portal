// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SET_AT = '2026-10-01T00:00:00Z';

const mock = vi.hoisted(() => {
  const state = {
    listener: null as null | ((event: string, session: unknown) => void),
    passwordSetAt: null as string | null,
  };
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        state.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      updateUser: vi.fn(async () => ({ data: {}, error: null as unknown })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null })),
    },
    from: vi.fn(() => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { role: 'INTERN', full_name: null, is_active: true, password_set_at: state.passwordSetAt }, error: null }),
      };
      return query;
    }),
  };
  const account = { markPasswordSet: vi.fn(async () => { state.passwordSetAt = '2026-10-17T12:00:00Z'; }) };
  return { state, supabase, account };
});
vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }));
vi.mock('@/features/auth/services/account.service', () => mock.account);

import { AuthProvider } from './AuthProvider';
import SetPassword from './SetPassword';

const GOOD = 'a long enough passphrase';

function emit(event: string, value: unknown) {
  act(() => { mock.state.listener?.(event, value); });
}

function renderPage(event = 'INITIAL_SESSION', session: unknown = { user: { id: 'u1' } }) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/set-password']}>
        <Routes>
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/login" element={<p>Login page</p>} />
          <Route path="/intern" element={<p>Intern home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  emit(event, session);
}

async function enter(password: string, confirmation = password) {
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('SetPassword', () => {
  beforeEach(() => { mock.state.listener = null; mock.state.passwordSetAt = null; window.sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('requires a verified session', async () => {
    renderPage('INITIAL_SESSION', null);
    expect(await screen.findByText('Login page')).toBeTruthy();
    expect(mock.supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('sends someone who already set a password to their portal', async () => {
    mock.state.passwordSetAt = SET_AT;
    renderPage();
    expect(await screen.findByText('Intern home')).toBeTruthy();
  });

  it.each([
    ['short', 'short', 'short', /at least 12 characters/],
    ['too long', 'x'.repeat(73), 'x'.repeat(73), /at most 72 characters/],
    ['mismatched', GOOD, `${GOOD}!`, /do not match/],
  ])('rejects a %s password before calling Supabase', async (_label, password, confirmation, message) => {
    renderPage();
    await enter(password, confirmation);
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
    expect(mock.supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(mock.account.markPasswordSet).not.toHaveBeenCalled();
  });

  it('first sign-in: sets the password with Supabase, records it, then opens the portal', async () => {
    renderPage();
    await enter(GOOD);
    expect(await screen.findByText('Intern home')).toBeTruthy();
    expect(mock.supabase.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(mock.supabase.auth.updateUser).toHaveBeenCalledWith({ password: GOOD });
    expect(mock.account.markPasswordSet).toHaveBeenCalledTimes(1);
    // The password is never kept in browser storage.
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(GOOD);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(GOOD);
  });

  it('ignores a repeated submission while saving', async () => {
    let finish!: (value: { data: object; error: null }) => void;
    mock.supabase.auth.updateUser.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderPage();
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: GOOD } });
    const form = screen.getByRole('button', { name: 'Save password' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await act(async () => { finish({ data: {}, error: null }); });
    expect(await screen.findByText('Intern home')).toBeTruthy();
    expect(mock.supabase.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(mock.account.markPasswordSet).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ code: 'weak_password', status: 422 }, /stronger password/],
    [{ code: 'reauthentication_needed', status: 400 }, /sign in again with a one-time email link/],
    [{ status: 401, message: 'raw detail' }, /sign-in has expired/],
  ])('shows a safe message when Supabase refuses (%o) and records nothing', async (authError, message) => {
    mock.supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: authError });
    renderPage();
    await enter(GOOD);
    expect((await screen.findByRole('alert')).textContent).toMatch(message);
    expect(screen.getByRole('alert').textContent).not.toContain('raw detail');
    expect(mock.account.markPasswordSet).not.toHaveBeenCalled();
  });

  it('interrupted setup: retries only the recording step after the password was saved', async () => {
    mock.account.markPasswordSet.mockRejectedValueOnce(new Error('network'));
    renderPage();
    await enter(GOOD);
    expect((await screen.findByRole('alert')).textContent).toMatch(/password was saved, but we could not finish/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Intern home')).toBeTruthy();
    expect(mock.supabase.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(mock.account.markPasswordSet).toHaveBeenCalledTimes(2);
  });

  it('after a refresh mid-setup, re-entering the same password still completes setup', async () => {
    mock.supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: { code: 'same_password', status: 422 } });
    renderPage();
    await enter(GOOD);
    expect(await screen.findByText('Intern home')).toBeTruthy();
    expect(mock.account.markPasswordSet).toHaveBeenCalledTimes(1);
  });

  it('password recovery: a reset link lets someone with a password choose a new one', async () => {
    mock.state.passwordSetAt = SET_AT;
    renderPage('PASSWORD_RECOVERY');
    expect(await screen.findByText('Choose a new password')).toBeTruthy();
    expect(window.sessionStorage.getItem('portal.passwordRecoveryUser')).toBe('u1');
    await enter(GOOD);
    expect(await screen.findByText('Intern home')).toBeTruthy();
    await waitFor(() => expect(mock.supabase.auth.updateUser).toHaveBeenCalledWith({ password: GOOD }));
    // A successful reset ends recovery mode, also for later refreshes.
    expect(window.sessionStorage.getItem('portal.passwordRecoveryUser')).toBeNull();
    cleanup();
    renderPage('INITIAL_SESSION');
    expect(await screen.findByText('Intern home')).toBeTruthy();
  });

  it('recovery survives a refresh of /set-password', async () => {
    mock.state.passwordSetAt = SET_AT;
    window.sessionStorage.setItem('portal.passwordRecoveryUser', 'u1');
    renderPage('INITIAL_SESSION');
    expect(await screen.findByText('Choose a new password')).toBeTruthy();
  });

  it('the person can abandon recovery and keep their current password', async () => {
    mock.state.passwordSetAt = SET_AT;
    renderPage('PASSWORD_RECOVERY');
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my current password' }));
    expect(await screen.findByText('Intern home')).toBeTruthy();
    expect(window.sessionStorage.getItem('portal.passwordRecoveryUser')).toBeNull();
    expect(mock.supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('first-time setup offers no way to skip it', async () => {
    renderPage();
    expect(await screen.findByText('Set your password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep my current password' })).toBeNull();
  });
});
