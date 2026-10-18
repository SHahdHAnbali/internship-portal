export type MentorPlacementStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

// A placement assigned to the signed-in Mentor, as shown on the Mentor dashboard.
export interface MentorPlacementResponse {
  placementId: string;
  internName: string | null;
  internEmail: string | null;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: MentorPlacementStatus;
  trainingTitle: string;
  reportsAwaitingReview: number;
}

export abstract class MentorPlacementRepository {
  abstract listForMentor(mentorProfileId: string): Promise<MentorPlacementResponse[]>;
}
