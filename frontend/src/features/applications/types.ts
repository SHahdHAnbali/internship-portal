export type ApplicationStatus =
  | 'DRAFT'
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'SELECTED'
  | 'REJECTED';

export interface ApplicationMatch {
  id: string;
  applicationId: string;

  overallScore: number;

  skillsScore: number;
  educationScore: number;
  experienceScore: number;
  languagesScore: number;

  matchedRequirements: string[];
  missingRequirements: string[];

  strengths: string[];
  gaps: string[];

  createdAt: string;
  updatedAt: string;
}

// A submitted application as listed for HR (never includes CV links).
export interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  internshipTitle: string;
  // Initial CV upload time.
  appliedAt: string;
  // Final review submission time (null only for legacy rows).
  submittedAt: string | null;
  status: ApplicationStatus;
  hasCv: boolean;
}

export type ApplicationSortField = 'submittedAt' | 'applicantName' | 'status';

export interface ApplicationListParams {
  status?: ApplicationStatus;
  search?: string;
  sort: ApplicationSortField;
  order: 'asc' | 'desc';
}

export interface ExtractedCvData {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;

  education: Array<{
    institution: string | null;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
  }>;

  experience: Array<{
    company: string | null;
    position: string | null;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
  }>;

  skills: string[];
  languages: string[];
  certifications: string[];

  links: {
    linkedin: string | null;
    github: string | null;
    portfolio: string | null;
  };
}

export type ReviewCvCheck =
  | { status: 'checked'; duplicate: boolean; previouslyUploaded: boolean }
  // The check could not be completed: never treated as "no duplicate".
  | { status: 'failed' }
  // Uploaded before CV fingerprints were stored: checked only on submission.
  | { status: 'unavailable' };

export interface ApplicationReview {
  applicationId: string;

  // Address the review link was sent to. It cannot be changed during review.
  reviewEmail: string | null;

  internship: {
    id: string;
    title: string;
  } | null;

  requestedTraining: string | null;

  // This draft's CV, checked when the review is loaded: whether the final
  // submission would refuse it as a duplicate for this training, and (warning
  // only) whether the same file was uploaded before for any application.
  cvCheck: ReviewCvCheck;

  extractedData: ExtractedCvData;
}

export type HrTargetStatus = Exclude<ApplicationStatus, 'DRAFT' | 'NEW'>;

export interface ApplicationStatusEvent {
  id: string;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  // Applicant-visible (rejections only).
  reason: string | null;
  // Internal HR note.
  note: string | null;
  createdAt: string;
  actor: { id: string; fullName: string | null; role: string } | null;
}

export interface ApplicationDetails {
  id: string;
  requestedTraining: string | null;

  status: ApplicationStatus;

  appliedAt: string;

  submittedAt: string | null;

  applicant: {
    id: string;
    fullName: string;
    email: string;
  } | null;

  internship: {
    id: string;
    title: string;
  } | null;

  rejectionReason: string | null;

  // Next statuses HR may choose (server-computed; the database enforces them).
  allowedTransitions: HrTargetStatus[];

  // The approved opportunity this request counts against (a listed training,
  // or the opportunity HR linked an "Other" request to); null when unlinked.
  opportunity: {
    id: string;
    title: string;
    selectionStatus: 'NOT_APPROVED' | 'OPEN' | 'CLOSED';
    capacity: number | null;
    seatsConsumed: number;
    remainingSeats: number | null;
  } | null;

  // Explicit HR release of this selection (final: no further placement).
  selectionRelease: { releasedAt: string; reason: string; releasedBy: string | null } | null;

  // Display hint; the server decides.
  canReleaseSelection: boolean;

  // What the applicant reviewed, corrected and submitted.
  reviewedData: ExtractedCvData | null;

  // What the AI originally extracted from the CV; null for applications
  // submitted before originals were retained.
  originalExtraction: ExtractedCvData | null;

  hasCv: boolean;

  statusHistory: ApplicationStatusEvent[];
}

export interface CvLink {
  url: string;
  expiresAt: string;
}

/* =========================================================
   Applicant Portal
   ========================================================= */

export interface ApplicantProfileApplication {
  id: string;

  trainingTitle: string;

  trainingType: 'INTERNSHIP' | 'OTHER';

  status: ApplicationStatus;

  appliedAt: string;

  submittedAt: string | null;

  // Shown to the applicant only when the application was rejected.
  rejectionReason: string | null;

  // The open placement of a selected application, if HR scheduled one.
  placement: ApplicantPlacement | null;
}

export interface ApplicantPlacement {
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  trainingTitle: string | null;
}

export interface ApplicantProfile {
  id: string;

  fullName: string;

  email: string;

  phone: string | null;

  location: string | null;

  profileData:
    | ExtractedCvData
    | null;

  applications:
    ApplicantProfileApplication[];
}
export type ApplicantProfileUpdate = Pick<ExtractedCvData,
  'summary' | 'education' | 'experience' | 'skills' | 'languages' | 'certifications' | 'links'> & {
  fullName: string;
  phone: string | null;
  location: string | null;
};
