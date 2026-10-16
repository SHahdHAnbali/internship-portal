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

export type InternTaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InternTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
// null: not reviewed yet (a COMPLETED task with null awaits the Mentor).
export type InternTaskReviewStatus = 'ACCEPTED' | 'CHANGES_REQUESTED' | null;

export interface InternTask {
  id: string;
  placementId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: InternTaskStatus;
  priority: InternTaskPriority;
  reviewStatus: InternTaskReviewStatus;
  mentorFeedback: string | null;
  reviewedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InternTaskEvent {
  id: string;
  taskId: string;
  type: 'CREATED' | 'UPDATED' | 'STARTED' | 'SUBMITTED' | 'ACCEPTED' | 'CHANGES_REQUESTED' | 'CANCELLED' | 'WITHDRAWN';
  fromStatus: InternTaskStatus | null;
  toStatus: InternTaskStatus | null;
  details: Record<string, unknown>;
  note: string | null;
  actorName: string | null;
  actorRole: string;
  createdAt: string;
}
