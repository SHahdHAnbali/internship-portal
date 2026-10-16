import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwTaskError } from '../../domain/task-errors.js';
import {
  InternTaskRepository,
  type CreateInternTaskInput,
  type InternTaskEventResponse,
  type InternTaskRecord,
  type InternTaskResponse,
  type MentorPlacementResponse,
  type TaskReviewDecision,
  type UpdateInternTaskInput,
} from '../../domain/repositories/intern-task.repository.js';

const TASK_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const COUNT_FIELDS = ['open_tasks', 'awaiting_review', 'overdue_tasks', 'accepted_tasks', 'reports_awaiting_review'] as const;

@Injectable()
export class SupabaseInternTaskRepository implements InternTaskRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async listForMentor(
    mentorProfileId: string,
  ): Promise<MentorPlacementResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_my_mentor_placements', {
      p_mentor_profile_id: mentorProfileId,
    });
    if (error) throwTaskError(error);
    if (!Array.isArray(data) || !data.every(isMentorPlacementRecord)) {
      throw new InternalServerErrorException('Database operation returned an invalid placement result');
    }
    return data.map((row) => ({
      placementId: row.placement_id,
      internName: row.intern_name,
      internEmail: row.intern_email,
      company: row.company,
      department: row.department,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      trainingTitle: row.training_title,
      openTasks: row.open_tasks,
      awaitingReview: row.awaiting_review,
      overdueTasks: row.overdue_tasks,
      acceptedTasks: row.accepted_tasks,
      reportsAwaitingReview: row.reports_awaiting_review,
    }));
  }

  async listForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<InternTaskResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_mentor_intern_tasks', {
      p_mentor_profile_id: mentorProfileId,
      p_placement_id: placementId,
    });
    if (error) throwTaskError(error);
    return this.many(data);
  }

  async listEventsForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<InternTaskEventResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_mentor_task_events', {
      p_mentor_profile_id: mentorProfileId,
      p_placement_id: placementId,
    });
    if (error) throwTaskError(error);
    if (!Array.isArray(data) || !data.every(isTaskEventRecord)) {
      throw new InternalServerErrorException('Database operation returned an invalid task history');
    }
    return data.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      type: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      details: row.details ?? {},
      note: row.note,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      createdAt: row.created_at,
    }));
  }

  async createForMentor(input: CreateInternTaskInput): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('create_mentor_intern_task', {
      p_mentor_profile_id: input.mentorProfileId,
      p_placement_id: input.placementId,
      p_title: input.title,
      p_description: input.description,
      p_due_date: input.dueDate,
      p_priority: input.priority,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  async updateForMentor(input: UpdateInternTaskInput): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('update_mentor_intern_task', {
      p_mentor_profile_id: input.mentorProfileId,
      p_task_id: input.taskId,
      p_title: input.title,
      p_description: input.description,
      p_due_date: input.dueDate,
      p_priority: input.priority,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  async cancelForMentor(
    mentorProfileId: string,
    taskId: string,
    reason: string,
  ): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('cancel_mentor_intern_task', {
      p_mentor_profile_id: mentorProfileId,
      p_task_id: taskId,
      p_reason: reason,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  async reviewForMentor(
    mentorProfileId: string,
    taskId: string,
    decision: TaskReviewDecision,
    feedback: string | null,
  ): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('review_mentor_intern_task', {
      p_mentor_profile_id: mentorProfileId,
      p_task_id: taskId,
      p_decision: decision,
      p_feedback: feedback,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  async listForIntern(authUserId: string): Promise<InternTaskResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_my_intern_tasks', {
      p_auth_user_id: authUserId,
    });
    if (error) throwTaskError(error);
    return this.many(data);
  }

  async updateStatus(
    authUserId: string,
    taskId: string,
    status: 'IN_PROGRESS' | 'COMPLETED',
    note: string | null,
  ): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('update_my_intern_task_status', {
      p_auth_user_id: authUserId,
      p_task_id: taskId,
      p_status: status,
      p_note: note,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  async withdrawSubmission(authUserId: string, taskId: string): Promise<InternTaskResponse> {
    const { data, error } = await this.supabase.client.rpc('withdraw_my_intern_task_submission', {
      p_auth_user_id: authUserId,
      p_task_id: taskId,
    });
    if (error) throwTaskError(error);
    return this.single(data);
  }

  private many(data: unknown): InternTaskResponse[] {
    if (!Array.isArray(data) || !data.every(isInternTaskRecord)) {
      throw new InternalServerErrorException('Database operation returned an invalid task result');
    }
    return data.map(toResponse);
  }

  private single(data: unknown): InternTaskResponse {
    if (!Array.isArray(data) || data.length !== 1 || !isInternTaskRecord(data[0])) {
      throw new InternalServerErrorException('Database operation returned an invalid task result');
    }
    return toResponse(data[0]);
  }
}

const nullableString = (value: unknown) => value === null || value === undefined || typeof value === 'string';

function isMentorPlacementRecord(value: unknown): value is {
  placement_id: string;
  intern_name: string | null;
  intern_email: string | null;
  company: string;
  department: string | null;
  start_date: string;
  end_date: string;
  status: MentorPlacementResponse['status'];
  training_title: string;
  open_tasks: number;
  awaiting_review: number;
  overdue_tasks: number;
  accepted_tasks: number;
  reports_awaiting_review: number;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['placement_id', 'company', 'start_date', 'end_date', 'training_title']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && (row.intern_name === null || typeof row.intern_name === 'string')
    && (row.intern_email === null || typeof row.intern_email === 'string')
    && (row.department === null || typeof row.department === 'string')
    && COUNT_FIELDS.every((key) => Number.isInteger(row[key]))
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(String(row.status));
}

function isTaskEventRecord(value: unknown): value is {
  id: string;
  task_id: string;
  event_type: InternTaskEventResponse['type'];
  from_status: InternTaskEventResponse['fromStatus'];
  to_status: InternTaskEventResponse['toStatus'];
  details: Record<string, unknown> | null;
  note: string | null;
  actor_name: string | null;
  actor_role: string;
  created_at: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['id', 'task_id', 'event_type', 'actor_role', 'created_at'].every((key) => typeof row[key] === 'string')
    && nullableString(row.from_status)
    && nullableString(row.to_status)
    && nullableString(row.note)
    && nullableString(row.actor_name);
}

function isInternTaskRecord(value: unknown): value is InternTaskRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const required = ['id', 'placement_id', 'title', 'created_at', 'updated_at'];
  return required.every((field) => typeof row[field] === 'string' && row[field] !== '')
    && typeof row.title === 'string'
    && row.title.trim() !== ''
    && (row.description === null || typeof row.description === 'string')
    && (row.due_date === null || typeof row.due_date === 'string')
    && TASK_STATUSES.includes(String(row.status))
    && PRIORITIES.includes(String(row.priority))
    && (row.review_status === null || row.review_status === 'ACCEPTED' || row.review_status === 'CHANGES_REQUESTED')
    && nullableString(row.mentor_feedback)
    && nullableString(row.reviewed_at)
    && nullableString(row.cancelled_at)
    && nullableString(row.cancellation_reason);
}

function toResponse(row: InternTaskRecord): InternTaskResponse {
  return {
    id: row.id,
    placementId: row.placement_id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    status: row.status,
    priority: row.priority,
    reviewStatus: row.review_status ?? null,
    mentorFeedback: row.mentor_feedback ?? null,
    reviewedAt: row.reviewed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
