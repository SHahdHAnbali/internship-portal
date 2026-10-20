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

export interface CvCheckResult {
  // This CV file was already submitted with an application (any status,
  // training or applicant), so it cannot be used for another application.
  // (null only from older servers when no training was given.)
  duplicate: boolean | null;
  // Warning only: the same file was uploaded before, drafts included.
  previouslyUploaded: boolean;
}

// Public, read-only CV check by the file's SHA-256. Answers only yes/no; the
// server never says who uploaded a matching file or for what.
export async function checkCvDuplicate(
  cvSha256: string,
  internshipId: string | null,
  requestedTraining: string | null,
): Promise<CvCheckResult> {
  const body: Record<string, string> = { cvSha256 };
  if (internshipId) body.internshipId = internshipId;
  else if (requestedTraining) body.requestedTraining = requestedTraining;

  const response = await fetch(`${env.apiUrl}/applications/cv-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to check your CV'));
  }

  const result = (await response.json().catch(() => null)) as { duplicate?: unknown; previouslyUploaded?: unknown } | null;
  const duplicateOk = result?.duplicate === null || typeof result?.duplicate === 'boolean';
  if (!duplicateOk || typeof result?.previouslyUploaded !== 'boolean') {
    throw new Error('Unable to check your CV');
  }
  return { duplicate: result.duplicate as boolean | null, previouslyUploaded: result.previouslyUploaded };
}

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

  // A signed-in applicant uploads as their own account, so the server also
  // checks the one-application rule for that account.
  const headers = new Headers();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${env.apiUrl}/applications/submit`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('CV file must be 5 MB or smaller.');
    }
    throw await reviewError(response, 'Unable to submit application');
  }

  return (await response.json()) as SubmitApplicationResponse;
}

// A CV file already submitted with an application cannot be used for another
// one. Returned by the upload, the review link and the final submission;
// checked before PREVIOUS_APPLICATION_EXISTS.
export const CV_ALREADY_SUBMITTED = 'CV_ALREADY_SUBMITTED';

// Each applicant may submit only one application, ever (any status, training
// or CV). Returned by the upload, the review link and the final submission.
export const PREVIOUS_APPLICATION_EXISTS = 'PREVIOUS_APPLICATION_EXISTS';

// Signed-in user: may they start an application? The server enforces the same
// rule on the upload and the final submission.
export async function getApplicationEligibility(): Promise<{ canApply: boolean }> {
  const response = await authenticatedFetch(`${env.apiUrl}/applications/eligibility`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to check whether you can apply.'));
  }
  const body = (await response.json().catch(() => null)) as { canApply?: unknown } | null;
  if (typeof body?.canApply !== 'boolean') {
    throw new Error('Unable to check whether you can apply.');
  }
  return { canApply: body.canApply };
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

// An error from the application endpoints (upload and review), carrying the
// server's machine code.
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
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message
    : Array.isArray(body?.message) && body.message.length > 0
      ? body.message.map(String).join(' ')
      : fallback;
  return new ReviewSubmissionError(
    message,
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
