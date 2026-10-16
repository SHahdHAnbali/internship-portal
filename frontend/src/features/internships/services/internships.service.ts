import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

import type {
  CreateInternshipInput,
  Internship,
} from '../types';

export async function getInternships(): Promise<
  Internship[]
> {
  const response = await fetch(
    `${env.apiUrl}/internships`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load internships (${response.status})`,
    );
  }

  return (await response.json()) as Internship[];
}

// HR: every training type, listed or not (the public list shows listed only).
export async function getHrInternships(): Promise<Internship[]> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/internships/manage`,
    {
      method: 'GET',
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load internships (${response.status})`,
    );
  }

  return (await response.json()) as Internship[];
}

export async function createInternship(
  input: CreateInternshipInput,
): Promise<Internship> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/internships`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },

      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to create the training opportunity'));
  }

  return (await response.json()) as Internship;
}
