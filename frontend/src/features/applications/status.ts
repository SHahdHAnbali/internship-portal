import type { ApplicationStatus } from './types';

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  NEW: 'New',
  UNDER_REVIEW: 'Under review',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

export const APPLICATION_STATUS_STYLES: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  NEW: 'bg-blue-50 text-blue-700',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700',
  SHORTLISTED: 'bg-violet-50 text-violet-700',
  INTERVIEW: 'bg-cyan-50 text-cyan-700',
  SELECTED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

// Statuses HR can filter by (drafts are never listed).
export const SUBMITTED_STATUSES: ApplicationStatus[] = [
  'NEW',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'REJECTED',
];

// What an applicant sees for each status. Internal HR stages are described
// without exposing internal notes.
export const APPLICANT_STATUS_MESSAGES: Record<ApplicationStatus, string> = {
  DRAFT: 'Waiting for you to review and submit.',
  NEW: 'Submitted. The recruitment team will review it soon.',
  UNDER_REVIEW: 'The recruitment team is reviewing your application.',
  SHORTLISTED: 'You have been shortlisted.',
  INTERVIEW: 'You have been invited to the interview stage.',
  SELECTED: 'Congratulations, you have been selected.',
  REJECTED: 'Your application was not successful.',
};
