export type InternPlacementStatus =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MyInternPlacement {
  id: string;
  applicationId: string;
  applicantId: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: InternPlacementStatus;
  createdAt: string;
  updatedAt: string;
  trainingTitle: string;
  mentor: { fullName: string | null; email: string | null } | null;
  // Set once HR completes the placement; the portal is then read-only.
  completedAt: string | null;
  endedEarly: boolean | null;
}

export type WeeklyReportStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'RETURNED';

export interface WeeklyReportContent {
  summary: string | null;
  learnings: string | null;
  challenges: string | null;
  nextWeekPlan: string | null;
}

export interface WeeklyReport extends WeeklyReportContent {
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
