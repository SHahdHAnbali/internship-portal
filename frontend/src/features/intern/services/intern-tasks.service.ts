import { env } from '@/config/env';
import { authenticatedFetch } from '@/lib/api-client';

import type { InternTask, InternTaskEvent, InternTaskPriority } from '../types';

export interface MentorTaskInput {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: InternTaskPriority;
}

export interface MentorPlacement {
  placementId: string;
  internName: string | null;
  internEmail: string | null;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  trainingTitle: string;
  openTasks: number;
  awaitingReview: number;
  overdueTasks: number;
  acceptedTasks: number;
  reportsAwaitingReview: number;
}

export class InternTasksApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'InternTasksApiError';
    this.status = status;
  }
}

export async function getMyInternTasks(): Promise<InternTask[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/intern/me/tasks`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return parseTaskList(response, 'Unable to load assigned tasks');
}

export async function updateMyInternTaskStatus(
  taskId: string,
  status: 'IN_PROGRESS' | 'COMPLETED',
  note: string | null = null,
): Promise<InternTask> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/intern/me/tasks/${taskId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ status, note }),
    },
  );
  return parseTask(response, 'Unable to update task status');
}

// Takes back a submission awaiting review; the server checks ownership,
// review state and the deadline with its own clock.
export async function withdrawMyInternTaskSubmission(taskId: string): Promise<InternTask> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/intern/me/tasks/${taskId}/withdraw`,
    { method: 'POST', headers: { Accept: 'application/json' } },
  );
  return parseTask(response, 'Unable to withdraw the submission');
}

export async function getMyMentorPlacements(): Promise<MentorPlacement[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/placements`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await requestError(response, 'Unable to load assigned interns');
  const value: unknown = await response.json().catch(() => null);
  if (!Array.isArray(value) || !value.every(isMentorPlacement)) {
    throw new Error('The Mentor service returned an invalid placement response.');
  }
  return value;
}

export async function getMentorPlacementTasks(placementId: string): Promise<InternTask[]> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/mentor/placements/${placementId}/tasks`,
    { headers: { Accept: 'application/json' } },
  );
  return parseTaskList(response, 'Unable to load tasks for this placement');
}

export async function createMentorPlacementTask(
  placementId: string,
  input: MentorTaskInput,
): Promise<InternTask> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/mentor/placements/${placementId}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
  return parseTask(response, 'Unable to assign task');
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});

export async function updateMentorTask(taskId: string, input: MentorTaskInput): Promise<InternTask> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/tasks/${taskId}`, jsonRequest('PATCH', input));
  return parseTask(response, 'Unable to save the task');
}

export async function cancelMentorTask(taskId: string, reason: string): Promise<InternTask> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/tasks/${taskId}/cancel`, jsonRequest('POST', { reason }));
  return parseTask(response, 'Unable to cancel the task');
}

export async function reviewMentorTask(
  taskId: string,
  decision: 'ACCEPT' | 'REQUEST_CHANGES',
  feedback: string | null,
): Promise<InternTask> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/tasks/${taskId}/review`, jsonRequest('POST', { decision, feedback }));
  return parseTask(response, 'Unable to save the review');
}

export async function getMentorTaskEvents(placementId: string): Promise<InternTaskEvent[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/placements/${placementId}/task-events`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await requestError(response, 'Unable to load the task history');
  const value: unknown = await response.json().catch(() => null);
  if (!Array.isArray(value)) throw new Error('The task service returned an invalid response.');
  return value as InternTaskEvent[];
}

async function parseTaskList(response: Response, fallback: string): Promise<InternTask[]> {
  if (!response.ok) throw await requestError(response, fallback);
  const value: unknown = await response.json().catch(() => null);
  if (!Array.isArray(value) || !value.every(isInternTask)) {
    throw new Error('The task service returned an invalid response.');
  }
  return value;
}

async function parseTask(response: Response, fallback: string): Promise<InternTask> {
  if (!response.ok) throw await requestError(response, fallback);
  const value: unknown = await response.json().catch(() => null);
  if (!isInternTask(value)) throw new Error('The task service returned an invalid response.');
  return value;
}

async function requestError(response: Response, fallback: string): Promise<InternTasksApiError> {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
  const safeFallback = response.status === 401
    ? 'Your sign-in session has expired. Sign in again and retry.'
    : response.status === 403
      ? 'Your account does not have permission to manage these tasks.'
      : response.status === 409
        ? 'The task or placement changed. Refresh and try again.'
        : fallback;
  return new InternTasksApiError(message || safeFallback, response.status);
}

function isInternTask(value: unknown): value is InternTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['id', 'placementId', 'title', 'createdAt', 'updatedAt']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && (row.description === null || typeof row.description === 'string')
    && (row.dueDate === null || typeof row.dueDate === 'string')
    && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(String(row.status))
    && ['LOW', 'MEDIUM', 'HIGH'].includes(String(row.priority))
    && (row.mentorFeedback === null || typeof row.mentorFeedback === 'string');
}

function isMentorPlacement(value: unknown): value is MentorPlacement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['placementId', 'company', 'startDate', 'endDate']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && (row.internName === null || typeof row.internName === 'string')
    && (row.internEmail === null || typeof row.internEmail === 'string')
    && (row.department === null || typeof row.department === 'string')
    && typeof row.trainingTitle === 'string'
    && ['openTasks', 'awaitingReview', 'overdueTasks', 'acceptedTasks', 'reportsAwaitingReview'].every((key) => typeof row[key] === 'number')
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(String(row.status));
}
