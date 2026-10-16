import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwPlacementError } from '../../domain/placement-errors.js';

export interface InternProgressResponse {
  placementId: string;
  applicationId: string;
  internName: string | null;
  internEmail: string | null;
  trainingTitle: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
  mentorName: string | null;
  mentorActive: boolean | null;
  tasks: { total: number; open: number; overdue: number; awaitingReview: number; accepted: number };
  reports: { expected: number; submitted: number; accepted: number; returned: number; lastWeek: string | null };
  lastActivityAt: string;
}

const COUNTS = [
  'tasks_total', 'tasks_open', 'tasks_overdue', 'tasks_awaiting_review', 'tasks_accepted',
  'reports_expected', 'reports_submitted', 'reports_accepted', 'reports_returned',
] as const;

type ProgressRow = Record<(typeof COUNTS)[number], number> & {
  placement_id: string;
  application_id: string;
  intern_name: string | null;
  intern_email: string | null;
  training_title: string;
  company: string;
  department: string | null;
  start_date: string;
  end_date: string;
  status: InternProgressResponse['status'];
  mentor_name: string | null;
  mentor_active: boolean | null;
  last_report_week: string | null;
  last_activity_at: string;
};

// HR follow-up of placements: counts only, no task or report content.
@Injectable()
export class InternProgressService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(actorProfileId: string): Promise<InternProgressResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_hr_intern_progress', {
      p_actor_profile_id: actorProfileId,
    });
    if (error) throwPlacementError(error);
    if (!Array.isArray(data) || !data.every(isProgressRow)) {
      throw new InternalServerErrorException('Database operation returned an invalid progress result');
    }
    return data.map((row) => ({
      placementId: row.placement_id,
      applicationId: row.application_id,
      internName: row.intern_name,
      internEmail: row.intern_email,
      trainingTitle: row.training_title,
      company: row.company,
      department: row.department,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      mentorName: row.mentor_name,
      mentorActive: row.mentor_active,
      tasks: {
        total: row.tasks_total,
        open: row.tasks_open,
        overdue: row.tasks_overdue,
        awaitingReview: row.tasks_awaiting_review,
        accepted: row.tasks_accepted,
      },
      reports: {
        expected: row.reports_expected,
        submitted: row.reports_submitted,
        accepted: row.reports_accepted,
        returned: row.reports_returned,
        lastWeek: row.last_report_week,
      },
      lastActivityAt: row.last_activity_at,
    }));
  }
}

function isProgressRow(value: unknown): value is ProgressRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['placement_id', 'application_id', 'training_title', 'company', 'start_date', 'end_date', 'last_activity_at']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && COUNTS.every((key) => Number.isInteger(row[key]))
    && ['SCHEDULED', 'ACTIVE', 'COMPLETED'].includes(String(row.status))
    && (row.mentor_active === null || typeof row.mentor_active === 'boolean');
}
