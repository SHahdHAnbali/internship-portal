import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';
import type { ApplicantProfile } from '@/features/applications/types';

import type { WeeklyReport, WeeklyReportContent } from '../types';

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await authenticatedFetch(`${env.apiUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, fallback));
  }
  return (await response.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// Intern: own reports of the active placement.
export function getMyWeeklyReports() {
  return request<WeeklyReport[]>('/intern/me/weekly-reports', {}, 'Unable to load your reports.');
}

export function saveMyWeeklyReport(weekStart: string, content: WeeklyReportContent) {
  return request<WeeklyReport>(`/intern/me/weekly-reports/${weekStart}`, json('PUT', content), 'Unable to save the report.');
}

export function submitMyWeeklyReport(reportId: string) {
  return request<WeeklyReport>(`/intern/me/weekly-reports/${reportId}/submit`, json('POST'), 'Unable to submit the report.');
}

// Mentor: submitted reports of an assigned active placement.
export function getMentorWeeklyReports(placementId: string) {
  return request<WeeklyReport[]>(`/mentor/placements/${placementId}/weekly-reports`, {}, 'Unable to load weekly reports.');
}

export function reviewMentorWeeklyReport(reportId: string, decision: 'ACCEPT' | 'RETURN', feedback: string | null) {
  return request<WeeklyReport>(`/mentor/weekly-reports/${reportId}/review`, json('POST', { decision, feedback }), 'Unable to save the review.');
}

// Intern: read-only view of the profile they submitted as an applicant.
export function getInternProfile() {
  return request<ApplicantProfile>('/intern/me/profile', {}, 'Unable to load your profile.');
}
