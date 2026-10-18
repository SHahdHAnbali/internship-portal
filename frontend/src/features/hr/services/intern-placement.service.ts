import { env } from '@/config/env';
import { authenticatedFetch } from '@/lib/api-client';

export type PlacementStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface HrInternPlacement {
  id: string;
  applicationId: string;
  applicantId: string;
  internshipId: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: PlacementStatus;
  mentorProfileId: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  completionNote: string | null;
  endedEarly: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface HrPlacementEvent {
  id: string;
  placementId: string;
  type: 'CREATED' | 'ACTIVATED' | 'CANCELLED' | 'COMPLETED' | 'MENTOR_ASSIGNED' | 'MENTOR_UNASSIGNED';
  fromStatus: PlacementStatus | null;
  toStatus: PlacementStatus | null;
  details: Record<string, unknown>;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

// Everything HR sees about an application's placements.
export interface HrApplicationPlacementOverview {
  current: HrInternPlacement | null;
  cancelled: HrInternPlacement[];
  trainingTitle: string | null;
  selectionStatus: 'NOT_APPROVED' | 'OPEN' | 'CLOSED' | null;
  capacity: number | null;
  // Cumulative: every unreleased selection keeps its seat.
  seatsConsumed: number;
  // Explicitly released: no further placement for this application.
  selectionReleased: boolean;
  history: HrPlacementEvent[];
}

export interface HrMentorProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  // Scheduled/active placements already supervised (information only).
  openPlacements: number;
}

export interface CreateHrInternPlacementInput {
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
}

export class PlacementRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PlacementRequestError';
    this.status = status;
  }
}

export async function createHrInternPlacement(
  applicationId: string,
  input: CreateHrInternPlacementInput,
): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/applications/${applicationId}/placements`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return parsePlacementResponse(response, 'Unable to create placement');
}

export async function getHrApplicationPlacement(applicationId: string): Promise<HrApplicationPlacementOverview> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/applications/${applicationId}/placement`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw await requestError(response, 'Unable to load placement');
  const value: unknown = await response.json().catch(() => null);
  if (!isPlacementOverview(value)) {
    throw new Error('The server returned an invalid placement response.');
  }
  return value;
}

export async function activateHrInternPlacement(placementId: string): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/placements/${placementId}/activate`,
    { method: 'POST', headers: { Accept: 'application/json' } },
  );
  return parsePlacementResponse(response, 'Unable to activate placement');
}

export async function cancelHrInternPlacement(placementId: string, reason: string): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/placements/${placementId}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  return parsePlacementResponse(response, 'Unable to cancel placement');
}

// Early end (before the planned end date) needs a note; the server also
// refuses while weekly reports await the Mentor's review.
export async function completeHrInternPlacement(placementId: string, note: string | null): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/placements/${placementId}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ note }),
    },
  );
  return parsePlacementResponse(response, 'Unable to complete placement');
}

export async function getHrMentors(): Promise<HrMentorProfile[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/hr/mentors`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await requestError(response, 'Unable to load Mentors');
  const value: unknown = await response.json().catch(() => null);
  if (!Array.isArray(value) || !value.every(isHrMentorProfile)) {
    throw new Error('The server returned an invalid Mentor list.');
  }
  return value;
}

export async function assignHrPlacementMentor(
  placementId: string,
  mentorProfileId: string,
): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/placements/${placementId}/mentor`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mentorProfileId }),
    },
  );
  return parsePlacementResponse(response, 'Unable to assign Mentor');
}

export async function unassignHrPlacementMentor(
  placementId: string,
  note: string | null,
): Promise<HrInternPlacement> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/hr/placements/${placementId}/mentor/unassign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ note }),
    },
  );
  return parsePlacementResponse(response, 'Unable to remove the Mentor');
}

async function parsePlacementResponse(
  response: Response,
  fallbackMessage: string,
): Promise<HrInternPlacement> {
  if (!response.ok) throw await requestError(response, fallbackMessage);
  const value: unknown = await response.json().catch(() => null);
  if (!isHrInternPlacement(value)) {
    throw new Error('The server returned an invalid placement response.');
  }
  return value;
}

async function requestError(response: Response, fallbackMessage: string): Promise<PlacementRequestError> {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
  const fallback = response.status === 401
    ? 'Your session has expired. Sign in again and retry.'
    : response.status === 403
      ? 'Only an authenticated HR user can manage placements.'
      : response.status === 409
        ? 'A placement already exists or this action conflicts with the current application state.'
        : fallbackMessage;
  return new PlacementRequestError(message || fallback, response.status);
}

function isHrInternPlacement(value: unknown): value is HrInternPlacement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const requiredStrings = [
    'id', 'applicationId', 'applicantId', 'internshipId', 'company', 'startDate', 'endDate', 'createdAt', 'updatedAt',
  ];
  return requiredStrings.every((key) => typeof row[key] === 'string' && row[key] !== '')
    && (row.department === null || typeof row.department === 'string')
    && (row.mentorProfileId === null || typeof row.mentorProfileId === 'string')
    && (row.cancelledAt === null || typeof row.cancelledAt === 'string')
    && (row.cancellationReason === null || typeof row.cancellationReason === 'string')
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(String(row.status));
}

function isPlacementOverview(value: unknown): value is HrApplicationPlacementOverview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.current === null || isHrInternPlacement(row.current))
    && Array.isArray(row.cancelled) && row.cancelled.every(isHrInternPlacement)
    && (row.trainingTitle === null || typeof row.trainingTitle === 'string')
    && (row.capacity === null || typeof row.capacity === 'number')
    && typeof row.seatsConsumed === 'number'
    && typeof row.selectionReleased === 'boolean'
    && Array.isArray(row.history) && row.history.every(isPlacementEvent);
}

function isPlacementEvent(value: unknown): value is HrPlacementEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.placementId === 'string'
    && typeof row.type === 'string' && typeof row.createdAt === 'string'
    && (row.note === null || typeof row.note === 'string')
    && (row.actorName === null || typeof row.actorName === 'string');
}

function isHrMentorProfile(value: unknown): value is HrMentorProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id !== ''
    && (row.fullName === null || typeof row.fullName === 'string')
    && (row.email === null || typeof row.email === 'string')
    && typeof row.openPlacements === 'number';
}
