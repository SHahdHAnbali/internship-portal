export type InternTaskStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InternTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
// null = no review yet (a COMPLETED task with null awaits the Mentor).
export type InternTaskReviewStatus = 'ACCEPTED' | 'CHANGES_REQUESTED' | null;
export type TaskReviewDecision = 'ACCEPT' | 'REQUEST_CHANGES';

export interface InternTaskRecord {
  id: string;
  placement_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: InternTaskStatus;
  priority: InternTaskPriority;
  review_status: InternTaskReviewStatus;
  mentor_feedback: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternTaskResponse {
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

export interface CreateInternTaskInput {
  mentorProfileId: string;
  placementId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: InternTaskPriority;
}

export interface UpdateInternTaskInput {
  mentorProfileId: string;
  taskId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: InternTaskPriority;
}

export interface MentorPlacementResponse {
  placementId: string;
  internName: string | null;
  internEmail: string | null;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  trainingTitle: string;
  openTasks: number;
  awaitingReview: number;
  overdueTasks: number;
  acceptedTasks: number;
  reportsAwaitingReview: number;
}

export interface InternTaskEventResponse {
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

export abstract class InternTaskRepository {
  abstract listForMentor(
    mentorProfileId: string,
  ): Promise<MentorPlacementResponse[]>;

  abstract listForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<InternTaskResponse[]>;

  abstract listEventsForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<InternTaskEventResponse[]>;

  abstract createForMentor(input: CreateInternTaskInput): Promise<InternTaskResponse>;

  abstract updateForMentor(input: UpdateInternTaskInput): Promise<InternTaskResponse>;

  abstract cancelForMentor(
    mentorProfileId: string,
    taskId: string,
    reason: string,
  ): Promise<InternTaskResponse>;

  abstract reviewForMentor(
    mentorProfileId: string,
    taskId: string,
    decision: TaskReviewDecision,
    feedback: string | null,
  ): Promise<InternTaskResponse>;

  abstract listForIntern(authUserId: string): Promise<InternTaskResponse[]>;

  abstract withdrawSubmission(authUserId: string, taskId: string): Promise<InternTaskResponse>;

  abstract updateStatus(
    authUserId: string,
    taskId: string,
    status: 'IN_PROGRESS' | 'COMPLETED',
    note: string | null,
  ): Promise<InternTaskResponse>;
}
