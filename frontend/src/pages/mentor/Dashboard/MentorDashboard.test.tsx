// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MentorPlacement } from '@/features/mentor/services/mentor-placements.service';
import type { WeeklyReport } from '@/features/intern/types';

const placementsApi = vi.hoisted(() => ({
  getMyMentorPlacements: vi.fn(),
}));
const reportsApi = vi.hoisted(() => ({
  getMentorWeeklyReports: vi.fn(),
  reviewMentorWeeklyReport: vi.fn(),
}));
vi.mock('@/features/mentor/services/mentor-placements.service', () => placementsApi);
vi.mock('@/features/intern/services/weekly-reports.service', () => reportsApi);

vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'mentor-1' } }) }));

import MentorDashboard from './MentorDashboard';

function placement(overrides: Partial<MentorPlacement>): MentorPlacement {
  return {
    placementId: 'active-id', internName: 'Active Intern', internEmail: null, company: 'Example Co', department: null,
    startDate: '2026-09-01', endDate: '2026-12-01', status: 'ACTIVE', trainingTitle: 'Engineering',
    reportsAwaitingReview: 0,
    ...overrides,
  };
}

const submittedReport: WeeklyReport = {
  id: 'r1', placementId: 'completed-id', weekStart: '2026-10-05', status: 'SUBMITTED', submittedAt: 's',
  mentorFeedback: null, reviewedAt: null, createdAt: 'c', updatedAt: 'u',
  summary: 'Built the login page', learnings: null, challenges: null, nextWeekPlan: null,
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><MentorDashboard /></MemoryRouter></QueryClientProvider>);
}

describe('MentorDashboard', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a completed placement\'s reports read-only, without review controls', async () => {
    placementsApi.getMyMentorPlacements.mockResolvedValue([
      placement({ placementId: 'completed-id', internName: 'Former Intern', status: 'COMPLETED' }),
    ]);
    reportsApi.getMentorWeeklyReports.mockResolvedValue([submittedReport]);
    renderDashboard();

    expect(await screen.findByText('Completed — read-only')).toBeTruthy();
    expect(screen.getByText('This placement is completed. Its weekly reports are read-only.')).toBeTruthy();
    expect(reportsApi.getMentorWeeklyReports).toHaveBeenCalledWith('completed-id');

    expect(screen.queryByRole('button', { name: 'Read & review' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    expect(await screen.findByText('Built the login page')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return for changes' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(reportsApi.reviewMentorWeeklyReport).not.toHaveBeenCalled();
  });

  it('offers report review for an active placement and shows the reports-to-review total', async () => {
    placementsApi.getMyMentorPlacements.mockResolvedValue([
      placement({ reportsAwaitingReview: 1 }),
      placement({ placementId: 'completed-id', internName: 'Former Intern', status: 'COMPLETED' }),
    ]);
    reportsApi.getMentorWeeklyReports.mockImplementation(async (id: string) =>
      id === 'active-id' ? [{ ...submittedReport, placementId: 'active-id' }] : []);
    renderDashboard();

    expect(await screen.findByRole('button', { name: 'Read & review' })).toBeTruthy();
    expect(screen.getByText('Reports to review').nextElementSibling?.textContent).toBe('1');
    expect(await screen.findByText('No weekly reports were submitted during this placement.')).toBeTruthy();
  });

  it('shows no task management anywhere', async () => {
    placementsApi.getMyMentorPlacements.mockResolvedValue([placement({})]);
    reportsApi.getMentorWeeklyReports.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText('Active Intern')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Assigned Interns');
    expect(screen.queryByRole('button', { name: 'Assign task' })).toBeNull();
    expect(screen.queryByText(/Open tasks/)).toBeNull();
    expect(screen.queryByText(/Tasks:/)).toBeNull();
  });

  it('keeps scheduled and cancelled placements without report access', async () => {
    placementsApi.getMyMentorPlacements.mockResolvedValue([
      placement({ placementId: 'scheduled-id', internName: 'Future Intern', status: 'SCHEDULED' }),
      placement({ placementId: 'cancelled-id', internName: 'Cancelled Intern', status: 'CANCELLED' }),
    ]);
    renderDashboard();
    expect((await screen.findAllByText('Weekly reports are available while the placement is active.')).length).toBe(2);
    expect(reportsApi.getMentorWeeklyReports).not.toHaveBeenCalled();
  });

  it('keeps the loading, empty and error states', async () => {
    placementsApi.getMyMentorPlacements.mockResolvedValueOnce([]);
    renderDashboard();
    expect(await screen.findByText('No interns assigned yet')).toBeTruthy();
    cleanup();

    placementsApi.getMyMentorPlacements.mockRejectedValueOnce(new Error('Unable to load placements'));
    renderDashboard();
    expect(screen.getByText('Loading your assignments…')).toBeTruthy();
    expect(await screen.findByText('Unable to load placements')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
