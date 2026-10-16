import { env } from '@/config/env';
import { authenticatedFetch } from '@/lib/api-client';

import type {
  InternshipRequirements,
  SaveInternshipRequirementsInput,
} from '../types';

export async function getInternshipRequirements(
    internshipId: string,
  ): Promise<InternshipRequirements | null> {
    const response = await authenticatedFetch(
      `${env.apiUrl}/internships/${internshipId}/requirements`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  
    if (!response.ok) {
      const text = await response.text();
  
      let body: {
        message?: string;
      } | null = null;
  
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
      }
  
      throw new Error(
        body?.message ??
          'Unable to load internship requirements',
      );
    }
  
    const text = await response.text();
  
    if (!text) {
      return null;
    }
  
    return JSON.parse(
      text,
    ) as InternshipRequirements;
  }

export async function saveInternshipRequirements(
  internshipId: string,
  input: SaveInternshipRequirementsInput,
): Promise<InternshipRequirements> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/internships/${internshipId}/requirements`,
    {
      method: 'PUT',

      headers: {
        'Content-Type':
          'application/json',

        Accept:
          'application/json',
      },

      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null);

    throw new Error(
      body?.message ??
        'Unable to save internship requirements',
    );
  }

  return (await response.json()) as InternshipRequirements;
}
