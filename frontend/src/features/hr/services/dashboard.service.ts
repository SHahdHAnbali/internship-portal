import { env } from '@/config/env';
import { authenticatedFetch } from '@/lib/api-client';

import type {
  HrDashboardData,
} from '../types';

export async function getHrDashboard(): Promise<HrDashboardData> {
  const response =
    await authenticatedFetch(
      `${env.apiUrl}/hr/dashboard`,
      {
        method: 'GET',
      },
    );

  if (!response.ok) {
    throw new Error(
      `Failed to load HR dashboard (${response.status})`,
    );
  }

  return (
    await response.json()
  ) as HrDashboardData;
}