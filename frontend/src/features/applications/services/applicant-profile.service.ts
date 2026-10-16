import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

import type {
  ApplicantProfile,
  ApplicantProfileUpdate,
} from '@/features/applications/types';

// The signed-in applicant's own profile and application history.
export async function getApplicantProfile(): Promise<ApplicantProfile> {
  const response = await authenticatedFetch(`${env.apiUrl}/applicant/me`);

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load your profile.'));
  }

  return (await response.json()) as ApplicantProfile;
}

export async function updateApplicantProfile(
  update: ApplicantProfileUpdate,
): Promise<ApplicantProfile> {
  const response = await authenticatedFetch(`${env.apiUrl}/applicant/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to save your profile.'));
  }

  return (await response.json()) as ApplicantProfile;
}
