export type WeeklyReportStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'RETURNED';
export type WeeklyReportDecision = 'ACCEPT' | 'RETURN';

export interface WeeklyReportContent {
  summary: string | null;
  learnings: string | null;
  challenges: string | null;
  nextWeekPlan: string | null;
}

export interface WeeklyReportResponse extends WeeklyReportContent {
  id: string;
  placementId: string;
  weekStart: string;
  status: WeeklyReportStatus;
  submittedAt: string | null;
  mentorFeedback: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class WeeklyReportRepository {
  abstract listForIntern(authUserId: string): Promise<WeeklyReportResponse[]>;

  abstract saveForIntern(
    authUserId: string,
    weekStart: string,
    content: WeeklyReportContent,
  ): Promise<WeeklyReportResponse>;

  abstract submitForIntern(authUserId: string, reportId: string): Promise<WeeklyReportResponse>;

  abstract listForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<WeeklyReportResponse[]>;

  abstract reviewForMentor(
    mentorProfileId: string,
    reportId: string,
    decision: WeeklyReportDecision,
    feedback: string | null,
  ): Promise<WeeklyReportResponse>;
}
