import type { Application } from '../entities/application.entity.js';
import type { ExtractedCvData } from '../types/extracted-cv-data.js';

export interface CreateDraftInput {
  internshipId: string | null;
  requestedTraining: string | null;
  cvPath: string;
  // SHA-256 (hex) of the uploaded CV file, for duplicate protection.
  cvSha256: string;
  // AI extraction shown on the review page. Stored twice: as the editable
  // data and as the immutable original extraction. No account, applicant or
  // profile is created until the emailed review link is used.
  extractedData: ExtractedCvData;
  // Normalized address the review link is emailed to. Immutable for the draft.
  reviewEmail: string;
}

export interface ApplicantIdentity {
  authUserId?: string | null;
  // Normalized (lower-case, trimmed) email address.
  email?: string | null;
}

export interface CreatedDraft {
  id: string;
  internshipId: string | null;
  requestedTraining: string | null;
  cvPath: string;
  reviewToken: string;
  status: 'DRAFT';
  createdAt: string;
}

export abstract class ApplicationRepository {
  // Submitted (non-DRAFT) applications only.
  abstract findAll(): Promise<Application[]>;

  abstract createDraft(
    input: CreateDraftInput,
  ): Promise<CreatedDraft>;

  // True when this exact CV file (by its SHA-256) is already part of a
  // submitted application: any status other than DRAFT, any training, any
  // applicant. Such a CV cannot be used for another application.
  // excludeApplicationId leaves out the application being reviewed.
  abstract hasSubmittedApplicationForCv(
    cvSha256: string,
    excludeApplicationId: string | null,
  ): Promise<boolean>;

  // True when this exact CV file (by its SHA-256) was uploaded before for any
  // application: any applicant, any training, any status, drafts included.
  // Only a yes/no for an early warning; it never decides a submission.
  // excludeApplicationId leaves out the application being reviewed.
  abstract hasPreviousUploadOfCv(
    cvSha256: string,
    excludeApplicationId: string | null,
  ): Promise<boolean>;

  // Applicant eligibility: true when this applicant (by Auth user and/or
  // normalized email) already has a submitted application, i.e. any status
  // other than DRAFT, for any training and with any CV. Each applicant may
  // apply only once.
  abstract hasSubmittedApplication(
    identity: ApplicantIdentity,
  ): Promise<boolean>;

  // Removes a draft created by the current request when it can never be
  // reviewed (for example, its review email could not be sent).
  abstract deleteUnsubmittedDraft(
    id: string,
  ): Promise<void>;
}
