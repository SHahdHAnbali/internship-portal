export type PlacementStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface CreateInternPlacementInput {
  actorProfileId: string;
  applicationId: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
}

export interface InternPlacementRecord {
  id: string;
  application_id: string;
  applicant_id: string;
  internship_id: string;
  company: string;
  department: string | null;
  start_date: string;
  end_date: string;
  status: PlacementStatus;
  mentor_profile_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  completion_note: string | null;
  ended_early: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface InternPlacementResponse {
  id: string;
  applicationId: string;
  applicantId: string;
  internshipId: string;
  company: string;
  department: string | null;
  startDate: string;
  endDate: string;
  status: PlacementStatus;
  mentorProfileId: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  completionNote: string | null;
  endedEarly: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlacementEventResponse {
  id: string;
  placementId: string;
  type: 'CREATED' | 'ACTIVATED' | 'CANCELLED' | 'COMPLETED' | 'MENTOR_ASSIGNED' | 'MENTOR_UNASSIGNED';
  fromStatus: PlacementStatus | null;
  toStatus: PlacementStatus | null;
  details: Record<string, unknown>;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

// Everything HR needs about an application's placements.
export interface ApplicationPlacementOverview {
  // The open (non-cancelled) placement, if any.
  current: InternPlacementResponse | null;
  cancelled: InternPlacementResponse[];
  trainingTitle: string | null;
  // The opportunity's HR selection state (null when the request is unlinked).
  selectionStatus: 'NOT_APPROVED' | 'OPEN' | 'CLOSED' | null;
  // Seats for the opportunity's cycle (null when not set).
  capacity: number | null;
  // Cumulative: every unreleased selection, whatever its placement became.
  seatsConsumed: number;
  // Explicitly released by HR: no further placement for this application.
  selectionReleased: boolean;
  history: PlacementEventResponse[];
}

export interface MentorProfileResponse {
  id: string;
  fullName: string | null;
  email: string | null;
  // Scheduled/active placements the Mentor already supervises (information
  // for HR only; nothing is assigned automatically).
  openPlacements: number;
}

export interface MyInternPlacementResponse extends InternPlacementResponse {
  trainingTitle: string;
  // The assigned Mentor's contact, so the intern knows who supervises them.
  mentor: { fullName: string | null; email: string | null } | null;
}

export abstract class InternPlacementRepository {
  abstract getOverviewForApplication(
    applicationId: string,
  ): Promise<ApplicationPlacementOverview>;

  abstract create(
    input: CreateInternPlacementInput,
  ): Promise<InternPlacementResponse>;

  abstract activate(
    actorProfileId: string,
    placementId: string,
  ): Promise<InternPlacementResponse>;

  abstract cancel(
    actorProfileId: string,
    placementId: string,
    reason: string,
  ): Promise<InternPlacementResponse>;

  abstract complete(
    actorProfileId: string,
    placementId: string,
    note: string | null,
  ): Promise<InternPlacementResponse>;

  // The intern's ACTIVE placement, or else their most recent COMPLETED one
  // (read-only after completion).
  abstract getActiveForAuthUser(
    authUserId: string,
  ): Promise<MyInternPlacementResponse>;

  abstract listMentors(actorProfileId: string): Promise<MentorProfileResponse[]>;

  abstract assignMentor(
    actorProfileId: string,
    placementId: string,
    mentorProfileId: string,
  ): Promise<InternPlacementResponse>;

  abstract unassignMentor(
    actorProfileId: string,
    placementId: string,
    note: string | null,
  ): Promise<InternPlacementResponse>;
}
