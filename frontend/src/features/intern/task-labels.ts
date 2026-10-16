import type { InternTask, InternTaskPriority, InternTaskStatus } from './types';

export const TASK_STATUS_LABELS: Record<InternTaskStatus, string> = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const TASK_PRIORITY_LABELS: Record<InternTaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const TASK_PRIORITIES: InternTaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

// One label that combines status and review, as both roles see it.
export function taskStateLabel(task: InternTask): string {
  if (task.status === 'COMPLETED') {
    return task.reviewStatus === 'ACCEPTED' ? 'Accepted' : 'Awaiting review';
  }
  if (task.status === 'IN_PROGRESS' && task.reviewStatus === 'CHANGES_REQUESTED') {
    return 'Changes requested';
  }
  return TASK_STATUS_LABELS[task.status];
}

export function isTaskOverdue(task: InternTask, today = localIsoDate()): boolean {
  return Boolean(task.dueDate)
    && (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS')
    && task.dueDate! < today;
}

// Organisation timezone that due dates are counted in (same as the server rule).
export const DUE_DATE_TIME_ZONE = 'Asia/Hebron';

// Today's calendar date in the organisation's timezone, as YYYY-MM-DD.
export function organisationIsoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DUE_DATE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// A submission can be withdrawn while it awaits review, the task has a due
// date and that due day (Asia/Hebron) has not ended. Display only: the server
// re-checks everything with its own clock.
export function canWithdrawSubmission(task: InternTask, now: Date = new Date()): boolean {
  return task.status === 'COMPLETED'
    && task.reviewStatus === null
    && Boolean(task.dueDate)
    && organisationIsoDate(now) <= task.dueDate!;
}

export function localIsoDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
