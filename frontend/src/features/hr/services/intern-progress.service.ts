import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

export interface InternProgress {
  placementId: string;
  applicationId: string;
  internName: string | null;
  internEmail: string | null;
  trainingTitle: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
  mentorName: string | null;
  mentorActive: boolean | null;
  tasks: { total: number; open: number; overdue: number; awaitingReview: number; accepted: number };
  reports: { expected: number; submitted: number; accepted: number; returned: number; lastWeek: string | null };
  lastActivityAt: string;
}

export async function getInternProgress(): Promise<InternProgress[]> {
  const response = await authenticatedFetch(`${env.apiUrl}/hr/intern-progress`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load intern progress.'));
  }
  return (await response.json()) as InternProgress[];
}
