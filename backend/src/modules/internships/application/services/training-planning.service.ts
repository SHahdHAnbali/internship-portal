import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import {
  buildTrainingPlan,
  type PlanApplicationRow,
  type PlanInternshipRow,
  type PlanMappingRow,
  type PlanPlacementRow,
  type PlanRequirementRow,
  type TrainingPlan,
} from '../../domain/types/training-plan.js';
import { throwPlanningError } from '../../domain/types/planning-errors.js';

type OneOrMany<T> = T | T[] | null;

interface PlanEventRow {
  id: string;
  event_type: string;
  internship_id: string | null;
  request_label: string | null;
  details: Record<string, unknown>;
  note: string | null;
  created_at: string;
  actor: OneOrMany<{ full_name: string | null }>;
  internship: OneOrMany<{ title: string }>;
}

const RECENT_EVENTS = 25;

@Injectable()
export class TrainingPlanningService {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  // Demand, eligibility signals and seat usage from real data.
  async getPlan(): Promise<TrainingPlan> {
    const client = this.supabase.client;
    const [internships, requirements, mappings, applications, placements] = await Promise.all([
      client.from('internships').select('id, title, is_active, selection_status, capacity, created_at, updated_at'),
      client.from('internship_requirements').select('internship_id, required_skills'),
      client.from('training_request_mappings').select('normalized_label, internship_id'),
      client
        .from('applications')
        .select('id, status, internship_id, requested_training, selection_released_at, skills:extracted_data->skills')
        .neq('status', 'DRAFT'),
      client.from('intern_placements').select('application_id, status'),
    ]);

    for (const result of [internships, requirements, mappings, applications, placements]) {
      if (result.error) {
        throw new InternalServerErrorException('Unable to load training planning data');
      }
    }

    return buildTrainingPlan({
      internships: (internships.data ?? []) as PlanInternshipRow[],
      requirements: (requirements.data ?? []) as PlanRequirementRow[],
      mappings: (mappings.data ?? []) as PlanMappingRow[],
      applications: (applications.data ?? []) as unknown as PlanApplicationRow[],
      placements: (placements.data ?? []) as PlanPlacementRow[],
    });
  }

  async getRecentEvents() {
    const { data, error } = await this.supabase.client
      .from('training_plan_events')
      .select(`
        id,
        event_type,
        internship_id,
        request_label,
        details,
        note,
        created_at,
        actor:profiles!training_plan_events_actor_profile_id_fkey ( full_name ),
        internship:internships!training_plan_events_internship_id_fkey ( title )
      `)
      .order('created_at', { ascending: false })
      .limit(RECENT_EVENTS);

    if (error) {
      throw new InternalServerErrorException('Unable to load the planning history');
    }

    return ((data ?? []) as PlanEventRow[]).map((event) => ({
      id: event.id,
      type: event.event_type,
      internshipId: event.internship_id,
      internshipTitle: first(event.internship)?.title ?? null,
      requestLabel: event.request_label,
      details: event.details,
      note: event.note,
      actorName: first(event.actor)?.full_name ?? null,
      createdAt: event.created_at,
    }));
  }

  async mapRequest(actorProfileId: string, label: string, internshipId: string, note: string | null) {
    const { data, error } = await this.supabase.client.rpc('map_training_request', {
      p_actor_profile_id: actorProfileId,
      p_label: label,
      p_internship_id: internshipId,
      p_note: note,
    });

    if (error) {
      throwPlanningError(error);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row.normalized_label !== 'string') {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }

    return { label: row.normalized_label as string, internshipId: row.internship_id as string };
  }

  async unmapRequest(actorProfileId: string, label: string, note: string | null) {
    const { error } = await this.supabase.client.rpc('unmap_training_request', {
      p_actor_profile_id: actorProfileId,
      p_label: label,
      p_note: note,
    });

    if (error) {
      throwPlanningError(error);
    }

    return { label: label.trim().toLowerCase(), internshipId: null };
  }
}

function first<T>(relation: OneOrMany<T>): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}
