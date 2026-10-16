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

  // True when a submitted, non-rejected application already uses this exact
  // CV for the same training target.
  abstract hasActiveApplicationForCv(
    cvSha256: string,
    internshipId: string | null,
    requestedTraining: string | null,
  ): Promise<boolean>;

  // Removes a draft created by the current request when it can never be
  // reviewed (for example, its review email could not be sent).
  abstract deleteUnsubmittedDraft(
    id: string,
  ): Promise<void>;
}
