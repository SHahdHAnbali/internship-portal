// Mentor evaluations (database functions in
// supabase/migrations/20261018010000_mentor_evaluations.sql and
// 20261018020000_mentor_evaluation_idempotency_and_attribution.sql).

export type EvaluationPublicationState = 'DRAFT' | 'UNPUBLISHED_CHANGES' | 'PUBLISHED';
export type EvaluationPlacementStatus = 'ACTIVE' | 'COMPLETED';

// The currently assigned Mentor's view: the saved working text plus the
// published snapshot, if any. publicationState and readOnly come from the
// server only.
export interface MentorEvaluationResponse {
  id: string;
  placementId: string;
  placementStatus: EvaluationPlacementStatus;
  readOnly: boolean;
  content: string;
  publicationState: EvaluationPublicationState;
  revision: number;
  published: {
    content: string;
    revision: number;
    publishedAt: string;
    firstPublishedAt: string;
    publishedByCurrentUser: boolean;
    // The Mentor who published the visible version (may differ from the author).
    publishedByName: string | null;
  } | null;
  // The original Mentor (never changes).
  authorName: string | null;
  lastEditorName: string | null;
  // The create operation's client request id (null for evaluations created
  // before it existed); lets the browser recognise its own create after an
  // unknown outcome.
  clientRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

// The intern's view: the published snapshot only (no working text, revision
// or publication state).
export interface InternEvaluationResponse {
  id: string;
  placementId: string;
  placementStatus: EvaluationPlacementStatus;
  trainingTitle: string;
  company: string;
  content: string;
  publishedAt: string;
  // The original Mentor, and the Mentor who published this version.
  authorName: string | null;
  publishedByName: string | null;
}

export abstract class EvaluationRepository {
  abstract listForMentorPlacement(mentorProfileId: string, placementId: string): Promise<MentorEvaluationResponse[]>;

  abstract getForMentor(mentorProfileId: string, evaluationId: string): Promise<MentorEvaluationResponse>;

  // Idempotent per (Mentor, clientRequestId): a retry returns the same evaluation.
  abstract createForMentor(
    mentorProfileId: string,
    placementId: string,
    clientRequestId: string,
    content: string,
  ): Promise<MentorEvaluationResponse>;

  abstract saveForMentor(
    mentorProfileId: string,
    evaluationId: string,
    expectedRevision: number,
    content: string,
  ): Promise<MentorEvaluationResponse>;

  abstract publishForMentor(
    mentorProfileId: string,
    evaluationId: string,
    expectedRevision: number,
  ): Promise<MentorEvaluationResponse>;

  abstract listForIntern(authUserId: string): Promise<InternEvaluationResponse[]>;

  abstract getForIntern(authUserId: string, evaluationId: string): Promise<InternEvaluationResponse>;
}
