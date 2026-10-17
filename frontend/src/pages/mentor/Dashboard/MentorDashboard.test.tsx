// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MentorPlacement } from '@/features/intern/services/intern-tasks.service';
import type { InternTask, WeeklyReport } from '@/features/intern/types';

const tasksApi = vi.hoisted(() => ({
  getMyMentorPlacements: vi.fn(),
  getMentorPlacementTasks: vi.fn(),
  getMentorTaskEvents: vi.fn(),
  createMentorPlacementTask: vi.fn(),
  updateMentorTask: vi.fn(),
  cancelMentorTask: vi.fn(),
  reviewMentorTask: vi.fn(),
}));
const reportsApi = vi.hoisted(() => ({
  getMentorWeeklyReports: vi.fn(),
  reviewMentorWeeklyReport: vi.fn(),
}));
vi.mock('@/features/intern/services/intern-tasks.service', () => tasksApi);
vi.mock('@/features/intern/services/weekly-reports.service', () => reportsApi);

import MentorDashboard from './MentorDashboard';

function placement(overrides: Partial<MentorPlacement>): MentorPlacement {
  return {
    placementId: 'active-id', internName: 'Active Intern', internEmail: null, company: 'Example Co', department: null,
    startDate: '2026-09-01', endDate: '2026-12-01', status: 'ACTIVE', trainingTitle: 'Engineering',
    openTasks: 0, awaitingReview: 0, overdueTasks: 0, acceptedTasks: 0, reportsAwaitingReview: 0,
    ...overrides,
  };
}

function task(overrides: Partial<InternTask>): InternTask {
  return {
    id: 't1', placementId: 'completed-id', title: 'Submitted work', description: null, dueDate: null,
    status: 'COMPLETED', priority: 'MEDIUM', reviewStatus: null, mentorFeedback: null, reviewedAt: null,
    cancelledAt: null, cancellationReason: null, createdAt: 'c', updatedAt: 'u',
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
  return render(<QueryClientProvider client={client}><MentorDashboard /></QueryClientProvider>);
}

describe('MentorDashboard: completed placements are read-only', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a completed placement\'s tasks and reports without any create, edit, cancel or review control', async () => {
    tasksApi.getMyMentorPlacements.mockResolvedValue([
      placement({ placementId: 'completed-id', internName: 'Former Intern', status: 'COMPLETED' }),
    ]);
    // Even if the data looked actionable, the read-only view offers no action.
    tasksApi.getMentorPlacementTasks.mockResolvedValue([
      task({}), task({ id: 't2', title: 'Still open', status: 'ASSIGNED' }),
    ]);
    tasksApi.getMentorTaskEvents.mockResolvedValue([]);
    reportsApi.getMentorWeeklyReports.mockResolvedValue([submittedReport]);
    renderDashboard();

    expect(await screen.findByText('Completed — read-only')).toBeTruthy();
    expect(screen.getByText('This placement is completed. Its tasks and weekly reports are read-only.')).toBeTruthy();
    expect(await screen.findByText('Submitted work')).toBeTruthy();
    expect(screen.getByText('Still open')).toBeTruthy();
    expect(tasksApi.getMentorPlacementTasks).toHaveBeenCalledWith('completed-id');
    expect(tasksApi.getMentorTaskEvents).toHaveBeenCalledWith('completed-id');

    expect(screen.queryByRole('button', { name: 'Assign task' })).toBeNull();
    expect(screen.queryByLabelText(/New task title/)).toBeNull();
    for (const name of ['Review', 'Edit', 'Cancel task']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: 'History' }).length).toBe(2);

    expect(screen.queryByRole('button', { name: 'Read & review' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    expect(await screen.findByText('Built the login page')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept report' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return for changes' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();

    for (const write of [tasksApi.createMentorPlacementTask, tasksApi.updateMentorTask, tasksApi.cancelMentorTask,
      tasksApi.reviewMentorTask, reportsApi.reviewMentorWeeklyReport]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('keeps full task management for an active placement next to a completed one', async () => {
    tasksApi.getMyMentorPlacements.mockResolvedValue([
      placement({}),
      placement({ placementId: 'completed-id', internName: 'Former Intern', status: 'COMPLETED' }),
    ]);
    tasksApi.getMentorPlacementTasks.mockImplementation(async (id: string) =>
      id === 'active-id' ? [task({ placementId: 'active-id', title: 'Active review' })] : []);
    tasksApi.getMentorTaskEvents.mockResolvedValue([]);
    reportsApi.getMentorWeeklyReports.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByRole('button', { name: 'Assign task' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Review' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Assign task' }).length).toBe(1);
    expect(await screen.findByText('No tasks were assigned during this placement.')).toBeTruthy();
    expect(screen.getByText('No weekly reports were submitted during this placement.')).toBeTruthy();
  });

  it('keeps scheduled and cancelled placements without task access', async () => {
    tasksApi.getMyMentorPlacements.mockResolvedValue([
      placement({ placementId: 'scheduled-id', internName: 'Future Intern', status: 'SCHEDULED' }),
      placement({ placementId: 'cancelled-id', internName: 'Cancelled Intern', status: 'CANCELLED' }),
    ]);
    renderDashboard();
    expect((await screen.findAllByText('Task management is available while the placement is active.')).length).toBe(2);
    expect(tasksApi.getMentorPlacementTasks).not.toHaveBeenCalled();
    expect(reportsApi.getMentorWeeklyReports).not.toHaveBeenCalled();
  });

  it('keeps the loading, empty and error states', async () => {
    tasksApi.getMyMentorPlacements.mockResolvedValueOnce([]);
    renderDashboard();
    expect(await screen.findByText('No interns assigned yet')).toBeTruthy();
    cleanup();

    tasksApi.getMyMentorPlacements.mockRejectedValueOnce(new Error('Unable to load placements'));
    renderDashboard();
    expect(screen.getByText('Loading your assignments…')).toBeTruthy();
    expect(await screen.findByText('Unable to load placements')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
