import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwTaskError } from '../../domain/task-errors.js';
import {
  WeeklyReportRepository,
  type WeeklyReportContent,
  type WeeklyReportDecision,
  type WeeklyReportResponse,
  type WeeklyReportStatus,
} from '../../domain/repositories/weekly-report.repository.js';

interface WeeklyReportRecord {
  id: string;
  placement_id: string;
  week_start: string;
  summary: string | null;
  learnings: string | null;
  challenges: string | null;
  next_week_plan: string | null;
  status: WeeklyReportStatus;
  submitted_at: string | null;
  mentor_feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SupabaseWeeklyReportRepository implements WeeklyReportRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async listForIntern(authUserId: string): Promise<WeeklyReportResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_my_weekly_reports', {
      p_auth_user_id: authUserId,
    });
    if (error) throwTaskError(error);
    return many(data);
  }

  async saveForIntern(
    authUserId: string,
    weekStart: string,
    content: WeeklyReportContent,
  ): Promise<WeeklyReportResponse> {
    const { data, error } = await this.supabase.client.rpc('save_my_weekly_report', {
      p_auth_user_id: authUserId,
      p_week_start: weekStart,
      p_summary: content.summary,
      p_learnings: content.learnings,
      p_challenges: content.challenges,
      p_next_week_plan: content.nextWeekPlan,
    });
    if (error) throwTaskError(error);
    return single(data);
  }

  async submitForIntern(authUserId: string, reportId: string): Promise<WeeklyReportResponse> {
    const { data, error } = await this.supabase.client.rpc('submit_my_weekly_report', {
      p_auth_user_id: authUserId,
      p_report_id: reportId,
    });
    if (error) throwTaskError(error);
    return single(data);
  }

  async listForMentorPlacement(
    mentorProfileId: string,
    placementId: string,
  ): Promise<WeeklyReportResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_mentor_weekly_reports', {
      p_mentor_profile_id: mentorProfileId,
      p_placement_id: placementId,
    });
    if (error) throwTaskError(error);
    return many(data);
  }

  async reviewForMentor(
    mentorProfileId: string,
    reportId: string,
    decision: WeeklyReportDecision,
    feedback: string | null,
  ): Promise<WeeklyReportResponse> {
    const { data, error } = await this.supabase.client.rpc('review_mentor_weekly_report', {
      p_mentor_profile_id: mentorProfileId,
      p_report_id: reportId,
      p_decision: decision,
      p_feedback: feedback,
    });
    if (error) throwTaskError(error);
    return single(data);
  }
}

function many(data: unknown): WeeklyReportResponse[] {
  if (!Array.isArray(data) || !data.every(isWeeklyReportRecord)) {
    throw new InternalServerErrorException('Database operation returned an invalid report result');
  }
  return data.map(toResponse);
}

function single(data: unknown): WeeklyReportResponse {
  if (!Array.isArray(data) || data.length !== 1 || !isWeeklyReportRecord(data[0])) {
    throw new InternalServerErrorException('Database operation returned an invalid report result');
  }
  return toResponse(data[0]);
}

const nullableString = (value: unknown) => value === null || typeof value === 'string';

function isWeeklyReportRecord(value: unknown): value is WeeklyReportRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['id', 'placement_id', 'week_start', 'created_at', 'updated_at']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && ['DRAFT', 'SUBMITTED', 'ACCEPTED', 'RETURNED'].includes(String(row.status))
    && ['summary', 'learnings', 'challenges', 'next_week_plan', 'submitted_at', 'mentor_feedback', 'reviewed_at']
      .every((key) => nullableString(row[key]));
}

function toResponse(row: WeeklyReportRecord): WeeklyReportResponse {
  return {
    id: row.id,
    placementId: row.placement_id,
    weekStart: row.week_start,
    summary: row.summary,
    learnings: row.learnings,
    challenges: row.challenges,
    nextWeekPlan: row.next_week_plan,
    status: row.status,
    submittedAt: row.submitted_at,
    mentorFeedback: row.mentor_feedback,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
