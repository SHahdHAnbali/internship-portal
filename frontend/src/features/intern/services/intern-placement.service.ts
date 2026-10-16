import { env } from '@/config/env';
import { authenticatedFetch } from '@/lib/api-client';

import type { MyInternPlacement } from '../types';

export class InternPlacementApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = 'InternPlacementApiError';
    this.status = status;
  }
}

export function placementErrorMessage(error: unknown): string {
  if (error instanceof InternPlacementApiError && error.status === 401) {
    return 'Your sign-in session is no longer valid. Sign in again to view your placement.';
  }
  if (error instanceof InternPlacementApiError && error.status === 403) {
    return 'This account does not have Intern access. Contact HR if you believe this is an error.';
  }
  if (error instanceof Error && error.message.includes('Authentication session')) {
    return 'Your sign-in session is unavailable. Sign in again to view your placement.';
  }
  return 'We could not reach the internship service. Check your connection and try again.';
}

export async function getMyInternPlacement(): Promise<MyInternPlacement | null> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/intern/me/placement`,
    { method: 'GET' },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new InternPlacementApiError(
      `Unable to load internship (${response.status})`,
      response.status,
    );
  }

  const placement: unknown = await response.json();
  if (!isMyInternPlacement(placement)) {
    throw new Error('The internship service returned an invalid response.');
  }

  return placement;
}

function isMyInternPlacement(value: unknown): value is MyInternPlacement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const placement = value as Record<string, unknown>;
  const requiredStrings = [
    'id',
    'applicationId',
    'applicantId',
    'company',
    'startDate',
    'endDate',
    'status',
    'createdAt',
    'updatedAt',
    'trainingTitle',
  ];

  return requiredStrings.every(
    (field) => typeof placement[field] === 'string' && placement[field] !== '',
  ) && (placement.department === null || typeof placement.department === 'string')
    && (placement.mentor === null || (typeof placement.mentor === 'object' && !Array.isArray(placement.mentor)))
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(
      placement.status as string,
    );
}
