import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';

import type {
  Application,
  ApplicationDetails,
  ApplicationListParams,
  ApplicationMatch,
  ApplicationReview,
  CvLink,
  ExtractedCvData,
  HrTargetStatus,
} from '../types';

export interface SubmitReviewedApplicationResponse {
  applicationId: string;
  status: 'NEW';
  submittedAt: string;
  message: string;
}

export interface SubmitApplicationResponse {
  applicationId: string;
  status: 'DRAFT';
  message: string;
}

/* ---------------------------------------------------------------------------
   HR
   --------------------------------------------------------------------------- */

function listQuery(params: ApplicationListParams): string {
  const query = new URLSearchParams({ sort: params.sort, order: params.order });
  if (params.status) query.set('status', params.status);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return query.toString();
}

export async function getApplications(
  params: ApplicationListParams,
): Promise<Application[]> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications?${listQuery(params)}`,
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load applications'));
  }

  return (await response.json()) as Application[];
}

// Downloads the CSV for exactly the rows the list shows for these filters.
export async function exportApplications(
  params: ApplicationListParams,
): Promise<{ blob: Blob; filename: string }> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/export?${listQuery(params)}`,
    { headers: { Accept: 'text/csv' } },
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to export applications'));
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'applications.csv';
  return { blob: await response.blob(), filename };
}

export async function getApplicationDetails(
  applicationId: string,
): Promise<ApplicationDetails> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}`,
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load application'));
  }

  return (await response.json()) as ApplicationDetails;
}

// A fresh, short-lived signed link to the private CV.
export async function getApplicationCvLink(
  applicationId: string,
): Promise<CvLink> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}/cv-url`,
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to open the CV'));
  }

  return (await response.json()) as CvLink;
}

export interface StatusChange {
  status: HrTargetStatus;
  // Shown to the applicant; required when rejecting.
  reason?: string | null;
  // Internal HR note.
  note?: string | null;
}

export async function updateApplicationStatus(
  applicationId: string,
  change: StatusChange,
): Promise<{ id: string; status: HrTargetStatus; rejectionReason: string | null; changedAt: string }> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: change.status,
        reason: change.reason ?? null,
        note: change.note ?? null,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to update application status'));
  }

  return response.json();
}

export async function getApplicationMatch(
  applicationId: string,
): Promise<ApplicationMatch | null> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}/match`,
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to load application match'));
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as ApplicationMatch) : null;
}

export async function runApplicationMatch(
  applicationId: string,
): Promise<ApplicationMatch> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}/match`,
    { method: 'POST' },
  );

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to run application matching'));
  }

  return (await response.json()) as ApplicationMatch;
}

/* ---------------------------------------------------------------------------
   Public application and review
   --------------------------------------------------------------------------- */

export async function submitApplication(
  internshipId: string | null,
  requestedTraining: string | null,
  cv: File,
): Promise<SubmitApplicationResponse> {
  const formData = new FormData();

  if (internshipId) {
    formData.append('internshipId', internshipId);
  }

  if (requestedTraining) {
    formData.append('requestedTraining', requestedTraining);
  }

  formData.append('cv', cv);

  const response = await fetch(`${env.apiUrl}/applications/submit`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      response.status === 413
        ? 'CV file must be 5 MB or smaller.'
        : await apiErrorMessage(response, 'Unable to submit application'),
    );
  }

  return (await response.json()) as SubmitApplicationResponse;
}

// Portal-wide intake (ADMIN): closed means no new applications and no
// finalizing of pending reviews. The server enforces it either way.
export const APPLICATIONS_CLOSED = 'APPLICATIONS_CLOSED';

export async function getApplicationIntake(): Promise<{ applicationsOpen: boolean }> {
  const response = await fetch(`${env.apiUrl}/applications/intake`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Unable to check whether applications are open.');
  }
  return (await response.json()) as { applicationsOpen: boolean };
}

export const REVIEW_LINK_NOT_FOUND = 'REVIEW_LINK_NOT_FOUND';
export const REVIEW_LINK_USED = 'REVIEW_LINK_USED';
export const REVIEW_LINK_EXPIRED = 'REVIEW_LINK_EXPIRED';

// Returned when an account already exists for the review email: the applicant
// must sign in to that account and reopen the review link.
export const ACCOUNT_SIGN_IN_REQUIRED = 'ACCOUNT_SIGN_IN_REQUIRED';

// An error from the review endpoints, carrying the server's machine code.
export class ReviewSubmissionError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'ReviewSubmissionError';
    this.code = code;
  }
}

async function reviewError(response: Response, fallback: string): Promise<ReviewSubmissionError> {
  const body = (await response.json().catch(() => null)) as
    | { message?: unknown; code?: unknown }
    | null;
  return new ReviewSubmissionError(
    typeof body?.message === 'string' ? body.message : fallback,
    typeof body?.code === 'string' ? body.code : null,
  );
}

export async function getApplicationReview(
  reviewToken: string,
): Promise<ApplicationReview> {
  const response = await fetch(
    `${env.apiUrl}/applications/review/${encodeURIComponent(reviewToken)}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!response.ok) {
    throw await reviewError(response, 'Unable to load application review');
  }

  return (await response.json()) as ApplicationReview;
}

export async function submitReviewedApplication(
  reviewToken: string,
  data: ExtractedCvData,
): Promise<SubmitReviewedApplicationResponse> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  // The review link is public, but an applicant who already has an account
  // submits as that signed-in account.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch(
    `${env.apiUrl}/applications/review/${encodeURIComponent(reviewToken)}/submit`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw await reviewError(response, 'Unable to submit application');
  }

  return (await response.json()) as SubmitReviewedApplicationResponse;
}

// HR releases a selection: frees its seat; final for this application (it stays
// SELECTED and can never receive another placement).
export async function releaseApplicationSelection(applicationId: string, reason: string): Promise<void> {
  const response = await authenticatedFetch(
    `${env.apiUrl}/applications/${encodeURIComponent(applicationId)}/release-selection`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to release the selection.'));
  }
}
