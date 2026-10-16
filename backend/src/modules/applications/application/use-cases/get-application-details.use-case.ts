import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { ApplicationStatus } from '../../domain/enums/application-status.enum.js';
import { allowedHrTransitions } from '../../domain/types/application-status-rules.js';
import { loadSubmittedApplication } from './submitted-application.js';

type OneOrMany<T> = T | T[] | null;

interface DetailsRow {
  id: string;
  status: ApplicationStatus;
  applied_at: string;
  submitted_at: string | null;
  created_at: string;
  cv_path: string | null;
  extracted_data: Record<string, unknown> | null;
  original_extracted_data: Record<string, unknown> | null;
  requested_training: string | null;
  rejection_reason: string | null;
  selection_released_at: string | null;
  selection_release_reason: string | null;
  releaser: OneOrMany<{ full_name: string | null }>;
  applicants: OneOrMany<{ id: string; full_name: string; email: string }>;
  internships: OneOrMany<{ id: string; title: string }>;
}

interface StatusEventRow {
  id: string;
  from_status: string;
  to_status: string;
  reason: string | null;
  note: string | null;
  created_at: string;
  actor: OneOrMany<{ id: string; full_name: string | null; role: string }>;
}

@Injectable()
export class GetApplicationDetailsUseCase {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async execute(applicationId: string) {
    const data = await loadSubmittedApplication<DetailsRow>(
      this.supabase,
      applicationId,
      `
        id,
        status,
        applied_at,
        submitted_at,
        created_at,
        cv_path,
        extracted_data,
        original_extracted_data,
        requested_training,
        rejection_reason,
        selection_released_at,
        selection_release_reason,
        releaser:profiles!applications_selection_released_by_fkey ( full_name ),
        applicants ( id, full_name, email ),
        internships ( id, title )
      `,
    );

    const { data: events, error: eventsError } = await this.supabase.client
      .from('application_status_events')
      .select(`
        id,
        from_status,
        to_status,
        reason,
        note,
        created_at,
        actor:profiles!application_status_events_actor_profile_id_fkey ( id, full_name, role )
      `)
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      throw new InternalServerErrorException('Unable to load the application history');
    }

    const applicant = first(data.applicants);
    const internship = first(data.internships);
    const opportunity = await this.loadOpportunity(internship?.id ?? null, data.requested_training);
    const placementStatuses = await this.loadPlacementStatuses(applicationId);
    const released = Boolean(data.selection_released_at);

    return {
      id: data.id,
      status: data.status,
      appliedAt: data.applied_at ?? data.created_at,
      submittedAt: data.submitted_at,
      requestedTraining: data.requested_training ?? null,
      rejectionReason: data.rejection_reason,
      allowedTransitions: allowedHrTransitions(data.status),
      applicant: applicant
        ? { id: applicant.id, fullName: applicant.full_name, email: applicant.email }
        : null,
      internship: internship
        ? { id: internship.id, title: internship.title }
        : null,
      // What the applicant confirmed and submitted.
      reviewedData: data.extracted_data,
      // What the AI extracted from the CV before the applicant's review.
      // Unavailable for applications submitted before it was retained.
      originalExtraction: data.original_extracted_data,
      hasCv: Boolean(data.cv_path),
      // The approved opportunity this request counts against (listed type, or
      // the opportunity HR linked an "Other" request to); null when unlinked.
      opportunity,
      // Explicit HR release of a selection: frees its seat, final for this
      // application (no further placement).
      selectionRelease: released
        ? {
          releasedAt: data.selection_released_at,
          reason: data.selection_release_reason,
          releasedBy: first(data.releaser)?.full_name ?? null,
        }
        : null,
      // Display hint only; the database decides.
      canReleaseSelection: data.status === ApplicationStatus.SELECTED && !released
        && !placementStatuses.some((status) => ['SCHEDULED', 'ACTIVE', 'COMPLETED'].includes(status)),
      statusHistory: ((events ?? []) as StatusEventRow[]).map((event) => {
        const actor = first(event.actor);
        return {
          id: event.id,
          fromStatus: event.from_status,
          toStatus: event.to_status,
          reason: event.reason,
          note: event.note,
          createdAt: event.created_at,
          actor: actor
            ? { id: actor.id, fullName: actor.full_name, role: actor.role }
            : null,
        };
      }),
    };
  }

  private async loadOpportunity(internshipId: string | null, requestedTraining: string | null) {
    const client = this.supabase.client;
    const { data: opportunityId, error: resolveError } = await client.rpc('resolve_application_training', {
      p_internship_id: internshipId,
      p_requested_training: requestedTraining,
    });
    if (resolveError) {
      throw new InternalServerErrorException('Unable to load the training opportunity');
    }
    if (typeof opportunityId !== 'string') {
      return null;
    }

    const [{ data: row, error: rowError }, { data: consumed, error: seatsError }] = await Promise.all([
      client.from('internships').select('id, title, is_active, selection_status, capacity').eq('id', opportunityId).maybeSingle(),
      client.rpc('training_opportunity_seats_consumed', { p_internship_id: opportunityId }),
    ]);
    if (rowError || seatsError || !row || typeof consumed !== 'number') {
      throw new InternalServerErrorException('Unable to load the training opportunity');
    }
    const opportunity = row as OpportunityRow;
    return {
      id: opportunity.id,
      title: opportunity.title,
      selectionStatus: opportunity.selection_status,
      capacity: opportunity.capacity,
      seatsConsumed: consumed,
      remainingSeats: opportunity.capacity === null ? null : Math.max(opportunity.capacity - consumed, 0),
    };
  }

  private async loadPlacementStatuses(applicationId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('intern_placements')
      .select('status')
      .eq('application_id', applicationId);
    if (error) {
      throw new InternalServerErrorException('Unable to load the placement');
    }
    return ((data ?? []) as { status: string }[]).map((row) => row.status);
  }
}

interface OpportunityRow {
  id: string;
  title: string;
  is_active: boolean;
  selection_status: 'NOT_APPROVED' | 'OPEN' | 'CLOSED';
  capacity: number | null;
}

function first<T>(relation: OneOrMany<T>): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}
