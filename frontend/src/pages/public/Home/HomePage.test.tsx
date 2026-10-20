// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getInternships: vi.fn(),
  getApplicationIntake: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  value: { user: null as { id: string; email: string } | null, role: null as string | null, loading: false },
}));
vi.mock('@/features/internships/services/internships.service', () => ({ getInternships: api.getInternships }));
vi.mock('@/features/applications/services/applications.service', () => ({
  getApplicationIntake: api.getApplicationIntake,
}));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ ...auth.value, fullName: null, signOut: vi.fn() }),
}));

import HomePage from './HomePage';

const internship = (id: string, title: string, isActive = true) => ({ id, title, isActive, createdAt: '2026-10-01' });

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const main = () => within(screen.getByRole('main'));

beforeEach(() => {
  api.getInternships.mockResolvedValue([internship('i1', 'Frontend Developer'), internship('i2', 'Data Analyst')]);
  api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.value = { user: null, role: null, loading: false };
});

describe('HomePage hero', () => {
  it('presents the internship journey with its two calls to action', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Start Your Internship Journey');
    // Exploring stays on the page (training areas); applying is a separate action.
    expect(main().getAllByRole('link', { name: /explore internships/i })[0].getAttribute('href')).toBe('#training-areas');
    expect(main().getByRole('link', { name: 'How It Works' }).getAttribute('href')).toBe('#how-it-works');
    expect(await screen.findByText('Applications are open')).toBeTruthy();
  });

  it('moves focus to the How it works section from the hero link', () => {
    renderHome();
    fireEvent.click(main().getByRole('link', { name: 'How It Works' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your path from application to internship' }));
  });

  it('moves focus to the training areas from Explore Internships', () => {
    renderHome();
    fireEvent.click(main().getAllByRole('link', { name: /explore internships/i })[0]);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Training Areas' }));
  });

  it('keeps Apply Now (in the navigation) on the application page', () => {
    renderHome();
    const nav = within(screen.getByRole('banner'));
    expect(nav.getByRole('link', { name: 'Apply Now' }).getAttribute('href')).toBe('/apply');
  });

  it('has no closing call-to-action section', () => {
    renderHome();
    expect(screen.queryByText('Ready to take the first step?')).toBeNull();
    expect(screen.queryByText(/then apply when you have found the one that fits you/)).toBeNull();
    // Explore Internships remains only in the hero.
    expect(main().getAllByRole('link', { name: /explore internships/i })).toHaveLength(1);
  });

  it('shows no intake status when it cannot be loaded', async () => {
    api.getApplicationIntake.mockRejectedValue(new Error('down'));
    renderHome();
    await screen.findByText('Frontend Developer');
    expect(screen.queryByText('Applications are open')).toBeNull();
    expect(screen.queryByText('Applications are currently closed')).toBeNull();
  });

  it('offers guests Sign In', () => {
    renderHome();
    expect(main().getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });

  it.each([
    ['APPLICANT', 'Go to My Profile', '/applicant/profile'],
    ['HR', 'Go to HR Dashboard', '/hr/dashboard'],
    ['ADMIN', 'Go to Admin Dashboard', '/admin/dashboard'],
    ['INTERN', 'Go to Intern Portal', '/intern'],
    ['MENTOR', 'Go to Mentor Portal', '/mentor'],
  ])('sends a signed-in %s to their own area', (role, name, href) => {
    auth.value = { user: { id: 'u1', email: 'user@example.test' }, role, loading: false };
    renderHome();
    expect(main().getByRole('link', { name }).getAttribute('href')).toBe(href);
    expect(main().queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('uses internship wording, not job or career wording', async () => {
    renderHome();
    await screen.findByText('Frontend Developer');
    const text = screen.getByRole('main').textContent ?? '';
    expect(text).not.toMatch(/\bcareer|\bjob\b|\bAI\b|intelligent/i);
  });
});

describe('HomePage training areas', () => {
  const section = () => within(document.getElementById('training-areas') as HTMLElement);

  it('introduces every listed training area as a card with its name', async () => {
    api.getInternships.mockResolvedValue([
      internship('i1', 'Frontend Developer'),
      internship('i2', 'Data Analyst'),
      internship('i3', 'Unlisted', false),
    ]);
    renderHome();
    expect(screen.getByRole('heading', { level: 2, name: 'Training Areas' })).toBeTruthy();
    expect(await section().findByRole('article', { name: 'Frontend Developer' })).toBeTruthy();
    expect(section().getByRole('article', { name: 'Data Analyst' })).toBeTruthy();
    expect(section().queryByText('Unlisted')).toBeNull();
  });

  it.each([
    ['open', { applicationsOpen: true }],
    ['closed', { applicationsOpen: false }],
  ])('shows no availability, status or apply action on the cards while intake is %s', async (_label, intake) => {
    api.getApplicationIntake.mockResolvedValue(intake);
    renderHome();
    await section().findByRole('article', { name: 'Frontend Developer' });
    await waitFor(() => expect(api.getApplicationIntake).toHaveBeenCalled());
    const text = (document.getElementById('training-areas') as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/available|closed|capacity|seats|status|apply now|apply for/i);
    expect(section().queryAllByRole('link')).toEqual([]);
  });

  it('keeps "Other" as a request made on the application form, not as an area', async () => {
    renderHome();
    await section().findByRole('article', { name: 'Frontend Developer' });
    expect(section().queryByRole('article', { name: /other/i })).toBeNull();
    expect(section().getByText(/choose .Other. and describe it/)).toBeTruthy();
  });

  it('shows all listed areas, not a preview', async () => {
    api.getInternships.mockResolvedValue(Array.from({ length: 8 }, (_, i) => internship(`i${i}`, `Training ${i}`)));
    renderHome();
    await section().findByRole('article', { name: 'Training 0' });
    expect(section().getAllByRole('article')).toHaveLength(8);
  });

  it('shows a loading state, then an empty state', async () => {
    let resolve: (value: unknown[]) => void = () => undefined;
    api.getInternships.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderHome();
    expect(screen.getByRole('status', { name: 'Loading training areas' })).toBeTruthy();
    await act(async () => { resolve([]); });
    expect(await screen.findByText('Our training areas will be listed here soon.')).toBeTruthy();
    expect(section().queryByRole('article')).toBeNull();
  });

  it('explains a loading failure and retries on request', async () => {
    api.getInternships.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([internship('i1', 'Frontend Developer')]);
    renderHome();
    expect(await screen.findByText('We could not load the training areas right now.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await section().findByRole('article', { name: 'Frontend Developer' })).toBeTruthy();
    expect(api.getInternships).toHaveBeenCalledTimes(2);
  });
});

describe('HomePage how it works', () => {
  it('shows one journey step at a time, selectable by click and arrow keys', () => {
    renderHome();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Explore Opportunities'),
      expect.stringContaining('Apply for an Internship'),
      expect.stringContaining('Learn & Grow'),
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toMatch(/Step 1 of 3/);

    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' });
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);
    expect(screen.getByRole('tabpanel').textContent).toMatch(/PDF or DOCX, up to 5 MB/);

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[2], { key: 'ArrowDown' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.click(tabs[2]);
    expect(screen.getByRole('tabpanel').textContent).toMatch(/certificate of completion/);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[2]]);
  });

  it('moves to the next step from the panel', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Apply for an Internship' }));
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
  });
});

describe('HomePage without an FAQ', () => {
  it('renders no FAQ section', () => {
    renderHome();
    expect(document.getElementById('faq')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Questions about applying' })).toBeNull();
  });
});
