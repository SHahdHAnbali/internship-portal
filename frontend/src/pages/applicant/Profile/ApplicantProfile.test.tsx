// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

// One application per applicant (enforced by the server): once an application
// is submitted, the page no longer invites the applicant to apply again.
describe('ApplicantProfile: apply link and the one-application rule', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); setSignedInUserId(null); });

  const submitted = (status: 'NEW' | 'SELECTED' | 'REJECTED') => ({
    id: 'app-1',
    trainingTitle: 'Frontend Developer',
    trainingType: 'INTERNSHIP' as const,
    status,
    appliedAt: '2026-10-01T09:00:00Z',
    submittedAt: '2026-10-01T09:30:00Z',
    rejectionReason: status === 'REJECTED' ? 'Not a fit this time' : null,
    placement: null,
  });

  it.each(['NEW', 'SELECTED', 'REJECTED'] as const)(
    'shows no apply link once an application is submitted (%s), and still shows the application',
    async (status) => {
      api.getApplicantProfile.mockResolvedValue({ ...profile('Lina', 'lina@example.com'), applications: [submitted(status)] });
      renderAs('applicant-a', newClient());
      expect(await screen.findByText('Frontend Developer')).toBeTruthy();
      expect(screen.getByText('My applications')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Apply for another training' })).toBeNull();
      expect(document.querySelector('a[href="/apply"]')).toBeNull();
      if (status === 'REJECTED') expect(screen.getByText('Not a fit this time')).toBeTruthy();
      // The rest of the page stays usable.
      expect(screen.getByRole('button', { name: /Edit profile/ })).toBeTruthy();
    },
  );

  it('keeps the apply link while no application has been submitted', async () => {
    api.getApplicantProfile.mockResolvedValue(profile('Lina', 'lina@example.com'));
    renderAs('applicant-a', newClient());
    expect(await screen.findByText('You have no submitted applications yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply for another training' }).closest('a')?.getAttribute('href')).toBe('/apply');
  });
});

describe('ApplicantProfile: Back to Website', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); setSignedInUserId(null); });

  function renderWithHome() {
    auth.userId = 'applicant-a';
    setSignedInUserId('applicant-a');
    return render(
      <QueryClientProvider client={newClient()}>
        <MemoryRouter initialEntries={['/applicant/profile']}>
          <Routes>
            <Route path="/" element={<p>Public homepage</p>} />
            <Route path="/applicant/profile" element={<ApplicantProfile />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows a Back to Website link in the header that returns to the homepage', async () => {
    api.getApplicantProfile.mockResolvedValue(profile('Lina', 'lina@example.com'));
    renderWithHome();
    const link = await screen.findByRole('link', { name: 'Back to Website' });
    expect(link.getAttribute('href')).toBe('/');
    expect(link.querySelector('button')).toBeNull();
    // The header's other action and the page's actions remain.
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Edit profile/ })).toBeTruthy();

    fireEvent.click(link);
    expect(await screen.findByText('Public homepage')).toBeTruthy();
  });

  it('offers the link when the profile cannot be loaded', async () => {
    api.getApplicantProfile.mockRejectedValue(new Error('down'));
    renderWithHome();
    expect(await screen.findByText('Unable to load your profile')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Back to Website' }));
    expect(await screen.findByText('Public homepage')).toBeTruthy();
  });
});

