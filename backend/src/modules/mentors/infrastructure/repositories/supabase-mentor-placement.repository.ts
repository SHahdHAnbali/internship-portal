import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';
import {
  MentorPlacementRepository,
  type MentorPlacementResponse,
} from '../../domain/repositories/mentor-placement.repository.js';

const STATUSES = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

interface MentorPlacementRecord {
  placement_id: string;
  intern_name: string | null;
  intern_email: string | null;
  company: string;
  department: string | null;
  start_date: string;
  end_date: string;
  status: MentorPlacementResponse['status'];
  training_title: string;
  reports_awaiting_review: number;
}

@Injectable()
export class SupabaseMentorPlacementRepository implements MentorPlacementRepository {
  constructor(private readonly supabase: SupabaseService) {}

  // list_my_mentor_placements checks the MENTOR role itself. Until the task
  // retirement migration is applied it also returns task counts; they are
  // ignored here, so rows with or without them are accepted.
  async listForMentor(mentorProfileId: string): Promise<MentorPlacementResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_my_mentor_placements', {
      p_mentor_profile_id: mentorProfileId,
    });
    if (error) throwSupabaseRpcHttpException(error);
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
      reportsAwaitingReview: row.reports_awaiting_review,
    }));
  }
}

const nullableString = (value: unknown) => value === null || typeof value === 'string';

function isMentorPlacementRecord(value: unknown): value is MentorPlacementRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['placement_id', 'company', 'start_date', 'end_date', 'training_title']
    .every((key) => typeof row[key] === 'string' && row[key] !== '')
    && nullableString(row.intern_name)
    && nullableString(row.intern_email)
    && nullableString(row.department)
    && Number.isInteger(row.reports_awaiting_review)
    && STATUSES.includes(String(row.status));
}
