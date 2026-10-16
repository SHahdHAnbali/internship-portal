import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

import type {
  Internship,
  TrainingPlan,
  UpdateInternshipInput,
} from '../types';

export async function getTrainingPlan(): Promise<TrainingPlan> {
  const response = await authenticatedFetch(`${env.apiUrl}/hr/training-planning`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load training planning'));
  }
  return (await response.json()) as TrainingPlan;
}

export async function updateTrainingOpportunity(
  internshipId: string,
  input: UpdateInternshipInput,
): Promise<Internship> {
  const response = await authenticatedFetch(`${env.apiUrl}/internships/${encodeURIComponent(internshipId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to update the training opportunity'));
  }
  return (await response.json()) as Internship;
}

export async function mapTrainingRequest(label: string, internshipId: string, note: string | null) {
  const response = await authenticatedFetch(`${env.apiUrl}/hr/training-planning/requests/mapping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, internshipId, note }),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to link the requested training'));
  }
  return response.json();
}

export async function unmapTrainingRequest(label: string, note: string | null) {
  const response = await authenticatedFetch(`${env.apiUrl}/hr/training-planning/requests/unmap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, note }),
  });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to unlink the requested training'));
  }
  return response.json();
}
