import { describe, expect, it } from 'vitest';

import { canWithdrawSubmission, organisationIsoDate } from './task-labels';
import type { InternTask } from './types';

const submitted: InternTask = {
  id: 't1', placementId: 'p1', title: 'Task', description: null, dueDate: '2026-10-15',
  status: 'COMPLETED', priority: 'MEDIUM', reviewStatus: null, mentorFeedback: null, reviewedAt: null,
  cancelledAt: null, cancellationReason: null, createdAt: 'c', updatedAt: 'u',
};

describe('canWithdrawSubmission (due day counts in full, Asia/Hebron)', () => {
  it('allows withdrawal until the last instant of the due day in Hebron', () => {
    // Hebron is UTC+3 in October.
    expect(canWithdrawSubmission(submitted, new Date('2026-10-15T20:59:59.999Z'))).toBe(true);
    expect(canWithdrawSubmission(submitted, new Date('2026-10-01T09:00:00Z'))).toBe(true);
  });

  it('refuses exactly at 00:00 Hebron after the due date, and later', () => {
    expect(organisationIsoDate(new Date('2026-10-15T21:00:00Z'))).toBe('2026-10-16');
    expect(canWithdrawSubmission(submitted, new Date('2026-10-15T21:00:00Z'))).toBe(false);
    expect(canWithdrawSubmission(submitted, new Date('2026-11-01T09:00:00Z'))).toBe(false);
  });

  it('refuses without a due date, after a review, or when not submitted', () => {
    const now = new Date('2026-10-01T09:00:00Z');
    expect(canWithdrawSubmission({ ...submitted, dueDate: null }, now)).toBe(false);
    expect(canWithdrawSubmission({ ...submitted, reviewStatus: 'ACCEPTED' }, now)).toBe(false);
    expect(canWithdrawSubmission({ ...submitted, status: 'IN_PROGRESS' }, now)).toBe(false);
    expect(canWithdrawSubmission({ ...submitted, status: 'IN_PROGRESS', reviewStatus: 'CHANGES_REQUESTED' }, now)).toBe(false);
    expect(canWithdrawSubmission({ ...submitted, status: 'ASSIGNED' }, now)).toBe(false);
    expect(canWithdrawSubmission({ ...submitted, status: 'CANCELLED' }, now)).toBe(false);
  });
});
