// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InternTask } from '@/features/intern/types';

const api = vi.hoisted(() => ({
  getMyInternTasks: vi.fn(),
  withdrawMyInternTaskSubmission: vi.fn(),
  updateMyInternTaskStatus: vi.fn(),
}));
vi.mock('@/features/intern/services/intern-tasks.service', () => api);

import AssignedTasks from './AssignedTasks';

const INTRO = 'Tasks assigned to you by your Mentor. Track your progress, submit completed work for review, and withdraw your submission before the due date if you need to make corrections. Your Mentor will review your submissions and provide feedback.';

function task(overrides: Partial<InternTask>): InternTask {
  return {
    id: 'pending', placementId: 'p1', title: 'Pending review', description: null, dueDate: '2099-12-31',
    status: 'COMPLETED', priority: 'MEDIUM', reviewStatus: null, mentorFeedback: null, reviewedAt: null,
    cancelledAt: null, cancellationReason: null, createdAt: 'c', updatedAt: 'u',
    ...overrides,
  };
}

const pending = task({});
const late = task({ id: 'late', title: 'Past due', dueDate: '2000-01-01' });
const accepted = task({ id: 'accepted', title: 'Accepted work', reviewStatus: 'ACCEPTED' });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssignedTasks />
    </QueryClientProvider>,
  );
}

const withdrawButtons = () => screen.queryAllByRole('button', { name: 'Withdraw submission' });

describe('AssignedTasks: withdraw submission', () => {
  beforeEach(() => {
    api.getMyInternTasks.mockResolvedValue([pending, late, accepted]);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the new introduction text exactly', async () => {
    renderPage();
    expect(await screen.findByText(INTRO)).toBeTruthy();
    expect(screen.getByText('YOUR WORK')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Assigned Tasks' })).toBeTruthy();
  });

  it('offers withdrawal only for the eligible submission (not past due, not reviewed)', async () => {
    renderPage();
    await screen.findByText('Pending review');
    expect(withdrawButtons()).toHaveLength(1);
    const card = screen.getByText('Past due').closest('[data-slot="card"]') ?? document.body;
    expect(within(card as HTMLElement).queryByRole('button', { name: 'Withdraw submission' })).toBeNull();
  });

  it('opens a confirmation dialog, and Cancel changes nothing', async () => {
    renderPage();
    await screen.findByText('Pending review');
    fireEvent.click(withdrawButtons()[0]);
    expect(await screen.findByText('Withdraw this submission?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Withdraw this submission?')).toBeNull());
    expect(api.withdrawMyInternTaskSubmission).not.toHaveBeenCalled();
  });

  it('withdraws once, shows success, and refreshes the task as in progress', async () => {
    let resolve!: (value: InternTask) => void;
    api.withdrawMyInternTaskSubmission.mockImplementation(() => new Promise<InternTask>((r) => { resolve = r; }));
    renderPage();
    await screen.findByText('Pending review');
    fireEvent.click(withdrawButtons()[0]);
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Withdraw submission' });
    // Repeated clicks while the request runs must not send duplicates.
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.withdrawMyInternTaskSubmission).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('button', { name: 'Withdrawing…' })).toHaveProperty('disabled', true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdrawing…' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(api.withdrawMyInternTaskSubmission).toHaveBeenCalledTimes(1);
    expect(api.withdrawMyInternTaskSubmission).toHaveBeenCalledWith('pending');

    api.getMyInternTasks.mockResolvedValue([{ ...pending, status: 'IN_PROGRESS' }, late, accepted]);
    await act(async () => { resolve({ ...pending, status: 'IN_PROGRESS' }); });

    expect(await screen.findByText('Submission withdrawn successfully. You can continue working on your task.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Mark completed' })).toBeTruthy();
    expect(withdrawButtons()).toHaveLength(0);
    expect(api.getMyInternTasks.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the server refusal, keeps the dialog open without claiming success, and refreshes', async () => {
    api.withdrawMyInternTaskSubmission.mockRejectedValue(
      new Error('The due date has passed, so this submission can no longer be withdrawn.'),
    );
    renderPage();
    await screen.findByText('Pending review');
    fireEvent.click(withdrawButtons()[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw submission' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toBe('The due date has passed, so this submission can no longer be withdrawn.');
    expect(screen.queryByText(/Submission withdrawn successfully/)).toBeNull();
    await waitFor(() => expect(api.getMyInternTasks.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
