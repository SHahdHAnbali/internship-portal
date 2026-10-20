// Mentor evaluations, as returned by the backend (modules/evaluations).

export type EvaluationPublicationState = 'DRAFT' | 'UNPUBLISHED_CHANGES' | 'PUBLISHED';
export type EvaluationPlacementStatus = 'ACTIVE' | 'COMPLETED';

// The currently assigned Mentor's view: saved working text plus the published
// snapshot. publicationState and readOnly come from the server only.
export interface MentorEvaluation {
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
  // The original Mentor (never changes, also after a reassignment).
  authorName: string | null;
  lastEditorName: string | null;
  // The create operation's idempotency key (the draft's client id).
  clientRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

// The intern's view: the published snapshot only.
export interface InternEvaluation {
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
