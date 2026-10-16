import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';
import { throwPlacementError } from '../../domain/placement-errors.js';
import {
  InternPlacementRepository,
  type ApplicationPlacementOverview,
  type CreateInternPlacementInput,
  type InternPlacementRecord,
  type InternPlacementResponse,
  type MentorProfileResponse,
  type MyInternPlacementResponse,
  type PlacementEventResponse,
} from '../../domain/repositories/intern-placement.repository.js';

type OneOrMany<T> = T | T[] | null;

const PLACEMENT_COLUMNS = `
  id,
  application_id,
  applicant_id,
  internship_id,
  company,
  department,
  start_date,
  end_date,
  status,
  mentor_profile_id,
  cancelled_at,
  cancellation_reason,
  completed_at,
  completion_note,
  ended_early,
  created_at,
  updated_at
`;

interface PlacementEventRow {
  id: string;
  placement_id: string;
  event_type: PlacementEventResponse['type'];
  from_status: PlacementEventResponse['fromStatus'];
  to_status: PlacementEventResponse['toStatus'];
  details: Record<string, unknown>;
  note: string | null;
  created_at: string;
  actor: OneOrMany<{ full_name: string | null }>;
}

@Injectable()
export class SupabaseInternPlacementRepository
  implements InternPlacementRepository
{
  constructor(private readonly supabase: SupabaseService) {}

  async getOverviewForApplication(applicationId: string): Promise<ApplicationPlacementOverview> {
    const client = this.supabase.client;

    const { data: application, error: applicationError } = await client
      .from('applications')
      .select('id, status, internship_id, requested_training, selection_released_at')
      .eq('id', applicationId)
      .maybeSingle();

    if (applicationError) {
      throw new InternalServerErrorException('Unable to load the application');
    }
    if (!application || application.status === 'DRAFT') {
      throw new NotFoundException('Application not found');
    }

    const { data: placements, error: placementsError } = await client
      .from('intern_placements')
      .select(PLACEMENT_COLUMNS)
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (placementsError) {
      throw new InternalServerErrorException('Unable to load the placement');
    }
    const rows = (placements ?? []) as unknown[];
    if (!rows.every(isInternPlacementRecord)) {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }
    const records = rows as InternPlacementRecord[];

    // The opportunity the application counts against (listed or mapped).
    const { data: opportunityId, error: resolveError } = await client.rpc('resolve_application_training', {
      p_internship_id: application.internship_id,
      p_requested_training: application.requested_training,
    });
    if (resolveError) {
      throw new InternalServerErrorException('Unable to load the training opportunity');
    }

    let trainingTitle: string | null = null;
    let selectionStatus: ApplicationPlacementOverview['selectionStatus'] = null;
    let capacity: number | null = null;
    let seatsConsumed = 0;
    if (typeof opportunityId === 'string') {
      const [{ data: internship, error: internshipError }, { data: consumed, error: seatsError }] = await Promise.all([
        client.from('internships').select('title, capacity, selection_status').eq('id', opportunityId).maybeSingle(),
        client.rpc('training_opportunity_seats_consumed', { p_internship_id: opportunityId }),
      ]);
      if (internshipError || seatsError || typeof consumed !== 'number') {
        throw new InternalServerErrorException('Unable to load the training opportunity');
      }
      trainingTitle = internship?.title ?? null;
      selectionStatus = internship?.selection_status ?? null;
      capacity = internship?.capacity ?? null;
      seatsConsumed = consumed;
    }

    let history: PlacementEventResponse[] = [];
    if (records.length > 0) {
      const { data: events, error: eventsError } = await client
        .from('intern_placement_events')
        .select(`
          id,
          placement_id,
          event_type,
          from_status,
          to_status,
          details,
          note,
          created_at,
          actor:profiles!intern_placement_events_actor_profile_id_fkey ( full_name )
        `)
        .in('placement_id', records.map((record) => record.id))
        .order('created_at', { ascending: true });
      if (eventsError) {
        throw new InternalServerErrorException('Unable to load the placement history');
      }
      history = ((events ?? []) as PlacementEventRow[]).map((event) => ({
        id: event.id,
        placementId: event.placement_id,
        type: event.event_type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        details: event.details,
        note: event.note,
        actorName: first(event.actor)?.full_name ?? null,
        createdAt: event.created_at,
      }));
    }

    const current = records.find((record) => record.status !== 'CANCELLED') ?? null;
    return {
      current: current ? this.toResponse(current) : null,
      cancelled: records.filter((record) => record.status === 'CANCELLED').map((record) => this.toResponse(record)),
      trainingTitle,
      selectionStatus,
      capacity,
      seatsConsumed,
      selectionReleased: Boolean(application.selection_released_at),
      history,
    };
  }

  async create(input: CreateInternPlacementInput): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('create_intern_placement', {
      p_actor_profile_id: input.actorProfileId,
      p_application_id: input.applicationId,
      p_company: input.company,
      p_department: input.department,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
    });

    if (error) {
      throwPlacementError(error);
    }

    return this.toResponse(this.singleRpcRow(data));
  }

  async activate(actorProfileId: string, placementId: string): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('activate_intern_placement', {
      p_actor_profile_id: actorProfileId,
      p_placement_id: placementId,
    });

    if (error) {
      throwPlacementError(error);
    }

    return this.toResponse(this.singleRpcRow(data));
  }

  async cancel(actorProfileId: string, placementId: string, reason: string): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('cancel_intern_placement', {
      p_actor_profile_id: actorProfileId,
      p_placement_id: placementId,
      p_reason: reason,
    });

    if (error) {
      throwPlacementError(error);
    }

    return this.toResponse(this.singleRpcRow(data));
  }

  async complete(actorProfileId: string, placementId: string, note: string | null): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('complete_intern_placement', {
      p_actor_profile_id: actorProfileId,
      p_placement_id: placementId,
      p_note: note,
    });

    if (error) {
      throwPlacementError(error);
    }

    return this.toResponse(this.singleRpcRow(data));
  }

  async listMentors(actorProfileId: string): Promise<MentorProfileResponse[]> {
    const { data, error } = await this.supabase.client.rpc('list_hr_mentors', {
      p_actor_profile_id: actorProfileId,
    });
    if (error) throwSupabaseRpcHttpException(error);
    if (!Array.isArray(data) || !data.every(isMentorProfileRecord)) {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }
    return data.map((mentor) => ({
      id: mentor.id,
      fullName: mentor.full_name,
      email: mentor.email,
      openPlacements: mentor.open_placements,
    }));
  }

  async assignMentor(
    actorProfileId: string,
    placementId: string,
    mentorProfileId: string,
  ): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('assign_intern_placement_mentor', {
      p_actor_profile_id: actorProfileId,
      p_placement_id: placementId,
      p_mentor_profile_id: mentorProfileId,
    });
    if (error) throwPlacementError(error);
    return this.toResponse(this.singleRpcRow(data));
  }

  async unassignMentor(
    actorProfileId: string,
    placementId: string,
    note: string | null,
  ): Promise<InternPlacementResponse> {
    const { data, error } = await this.supabase.client.rpc('unassign_intern_placement_mentor', {
      p_actor_profile_id: actorProfileId,
      p_placement_id: placementId,
      p_note: note,
    });
    if (error) throwPlacementError(error);
    return this.toResponse(this.singleRpcRow(data));
  }

  async getActiveForAuthUser(authUserId: string): Promise<MyInternPlacementResponse> {
    const { data: applicant, error: applicantError } = await this.supabase.client
      .from('applicants')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (applicantError) {
      throw new InternalServerErrorException('Unable to load your placement');
    }
    if (!applicant) {
      throw new NotFoundException('Intern placement not found');
    }

    const { data: placement, error: placementError } = await this.supabase.client
      .from('intern_placements')
      .select(`${PLACEMENT_COLUMNS},
        internship:internships!intern_placements_internship_id_fkey ( title ),
        mentor:profiles!intern_placements_mentor_profile_id_fkey ( full_name, email )`)
      .eq('applicant_id', applicant.id)
      .in('status', ['ACTIVE', 'COMPLETED'])
      .order('status', { ascending: true })
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (placementError) {
      throw new InternalServerErrorException('Unable to load your placement');
    }
    if (!placement) {
      throw new NotFoundException('Intern placement not found');
    }

    const row = placement as unknown as InternPlacementRecord & {
      internship: OneOrMany<{ title: string }>;
      mentor: OneOrMany<{ full_name: string | null; email: string | null }>;
    };
    const trainingTitle = first(row.internship)?.title;
    if (!trainingTitle) {
      throw new InternalServerErrorException('Placement training target is missing');
    }

    return {
      ...this.toResponse(row),
      trainingTitle,
      mentor: mentorContact(first(row.mentor)),
    };
  }

  private singleRpcRow(data: unknown): InternPlacementRecord {
    if (!Array.isArray(data) || data.length !== 1 || !isInternPlacementRecord(data[0])) {
      throw new InternalServerErrorException('Database operation returned an invalid result');
    }
    return data[0];
  }

  private toResponse(row: InternPlacementRecord): InternPlacementResponse {
    return {
      id: row.id,
      applicationId: row.application_id,
      applicantId: row.applicant_id,
      internshipId: row.internship_id,
      company: row.company,
      department: row.department,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      mentorProfileId: row.mentor_profile_id,
      cancelledAt: row.cancelled_at ?? null,
      cancellationReason: row.cancellation_reason ?? null,
      completedAt: row.completed_at ?? null,
      completionNote: row.completion_note ?? null,
      endedEarly: row.ended_early ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function mentorContact(mentor: { full_name: string | null; email: string | null } | null) {
  return mentor ? { fullName: mentor.full_name, email: mentor.email } : null;
}

function first<T>(relation: OneOrMany<T>): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function isInternPlacementRecord(value: unknown): value is InternPlacementRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  const requiredStrings = [
    'id',
    'application_id',
    'applicant_id',
    'internship_id',
    'company',
    'start_date',
    'end_date',
    'created_at',
    'updated_at',
  ];
  if (
    requiredStrings.some((field) => typeof row[field] !== 'string' || row[field] === '') ||
    (row.company as string).trim() === '' ||
    !(row.mentor_profile_id === null || typeof row.mentor_profile_id === 'string') ||
    !(row.department === null || typeof row.department === 'string') ||
    !(row.cancelled_at === null || row.cancelled_at === undefined || typeof row.cancelled_at === 'string') ||
    !(row.cancellation_reason === null || row.cancellation_reason === undefined || typeof row.cancellation_reason === 'string') ||
    !(row.completed_at === null || row.completed_at === undefined || typeof row.completed_at === 'string') ||
    !(row.completion_note === null || row.completion_note === undefined || typeof row.completion_note === 'string') ||
    !(row.ended_early === null || row.ended_early === undefined || typeof row.ended_early === 'boolean')
  ) {
    return false;
  }
  return ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(row.status as string);
}

function isMentorProfileRecord(
  value: unknown,
): value is { id: string; full_name: string | null; email: string | null; open_placements: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id !== ''
    && (row.full_name === null || typeof row.full_name === 'string')
    && (row.email === null || typeof row.email === 'string')
    && Number.isInteger(row.open_placements);
}
