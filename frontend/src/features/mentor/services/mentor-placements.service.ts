import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

// A placement assigned to the signed-in Mentor (GET /mentor/placements).
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
  reportsAwaitingReview: number;
}

export async function getMyMentorPlacements(): Promise<MentorPlacement[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/mentor/placements`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const fallback = response.status === 403
      ? 'Your account does not have permission to view assigned interns.'
      : 'Unable to load assigned interns';
    throw new Error(await apiErrorMessage(response, fallback));
  }
  const value: unknown = await response.json().catch(() => null);
  if (!Array.isArray(value) || !value.every(isMentorPlacement)) {
    throw new Error('The Mentor service returned an invalid placement response.');
  }
  return value;
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
    && typeof row.reportsAwaitingReview === 'number'
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(String(row.status));
}
