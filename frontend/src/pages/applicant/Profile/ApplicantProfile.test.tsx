// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicantProfile as ApplicantProfileType } from '@/features/applications/types';

const api = vi.hoisted(() => ({ getApplicantProfile: vi.fn(), updateApplicantProfile: vi.fn() }));
vi.mock('@/features/applications/services/applicant-profile.service', () => api);
const auth = vi.hoisted(() => ({ userId: 'applicant-a' }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: auth.userId }, signOut: vi.fn(), refreshProfile: vi.fn(async () => undefined) }),
}));

import { setSignedInUserId } from '@/lib/auth-identity';
import ApplicantProfile from './ApplicantProfile';

function profile(fullName: string, email: string): ApplicantProfileType {
  return { id: `id-${fullName}`, fullName, email, phone: null, location: null, profileData: null, applications: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function renderAs(userId: string, client: QueryClient) {
  auth.userId = userId;
  setSignedInUserId(userId);
  return render(<QueryClientProvider client={client}><MemoryRouter><ApplicantProfile /></MemoryRouter></QueryClientProvider>);
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });

async function startSave(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Edit profile/ }));
  fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /Save profile/ }));
}

describe('ApplicantProfile: cache isolation between accounts', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); setSignedInUserId(null); });

  it('saves normally for the same user', async () => {
    const client = newClient();
    api.getApplicantProfile.mockResolvedValue(profile('Applicant A', 'a@example.test'));
    api.updateApplicantProfile.mockResolvedValue(profile('Applicant A Renamed', 'a@example.test'));
    renderAs('applicant-a', client);
    await startSave('Applicant A Renamed');
    expect(await screen.findByText('Your profile was saved.')).toBeTruthy();
    expect(client.getQueryData<ApplicantProfileType>(['applicant', 'me', 'applicant-a'])?.fullName).toBe('Applicant A Renamed');
  });

  for (const clearsCache of [true, false]) {
    it(`a save started as A that finishes after the switch to B never shows A's data to B (cache ${clearsCache ? 'cleared' : 'not cleared'} on the switch)`, async () => {
      const client = newClient();
      const pending = deferred<ApplicantProfileType>();
      api.getApplicantProfile.mockResolvedValueOnce(profile('Applicant A', 'a@example.test'));
      api.updateApplicantProfile.mockReturnValue(pending.promise);
      const pageA = renderAs('applicant-a', client);
      await startSave('Applicant A Renamed');
      expect(api.updateApplicantProfile).toHaveBeenCalledTimes(1);

      // A signs out, B signs in in the same tab (AuthProvider clears the cache;
      // the second run checks the keys and the guard alone).
      pageA.unmount();
      if (clearsCache) client.clear();
      api.getApplicantProfile.mockResolvedValueOnce(profile('Applicant B', 'b@example.test'));
      renderAs('applicant-b', client);
      expect(await screen.findByText('b@example.test')).toBeTruthy();

      await act(async () => { pending.resolve(profile('Applicant A Renamed', 'a@example.test')); await pending.promise; });
      expect(screen.queryByText(/Applicant A/)).toBeNull();
      expect(screen.queryByText('a@example.test')).toBeNull();
      expect(client.getQueryData<ApplicantProfileType>(['applicant', 'me', 'applicant-b'])?.fullName).toBe('Applicant B');
      // The late result was not written anywhere (A's key holds at most A's own earlier load).
      expect(client.getQueryData<ApplicantProfileType>(['applicant', 'me', 'applicant-a'])?.fullName).not.toBe('Applicant A Renamed');
      expect(client.getQueryData(['applicant', 'me'])).toBeUndefined();
    });
  }
});
