export interface ApplicationDraft {
    id: string;
    internshipId: string;
    cvPath: string;
    reviewToken: string;
    status: 'DRAFT';
    createdAt: string;
  }