import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

type OneOrMany<T> = T | T[] | null;

interface ApplicantRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  profile_data: Record<string, unknown> | null;
}

interface ApplicantPlacementRow {
  application_id: string;
  status: string;
  company: string;
  department: string | null;
  start_date: string;
  end_date: string;
  internship: OneOrMany<{ title: string }>;
}

interface ApplicantApplicationRow {
  id: string;
  status: string;
  applied_at: string | null;
  submitted_at: string | null;
  created_at: string;
  requested_training: string | null;
  rejection_reason: string | null;
  internships: OneOrMany<{ id: string; title: string }>;
}

// The signed-in applicant's own profile and application history. Exposes only
// applicant-visible decision data (status and rejection reason); internal HR
// notes, status history, CV storage paths and matching results never appear.
@Injectable()
export class GetApplicantProfileUseCase {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async execute(authUserId: string) {
    const { data: applicant, error: applicantError } = await this.supabase.client
      .from('applicants')
      .select('id, full_name, email, phone, location, profile_data')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (applicantError) {
      throw new InternalServerErrorException('Unable to load your profile');
    }

    if (!applicant) {
      throw new NotFoundException('Applicant profile not found');
    }

    const row = applicant as ApplicantRow;

    const { data: applications, error: applicationsError } = await this.supabase.client
      .from('applications')
      .select(`
        id,
        status,
        applied_at,
        submitted_at,
        created_at,
        requested_training,
        rejection_reason,
        internships ( id, title )
      `)
      .eq('applicant_id', row.id)
      .neq('status', 'DRAFT')
      .order('created_at', { ascending: false });

    if (applicationsError) {
      throw new InternalServerErrorException('Unable to load your applications');
    }

    // The open placement of each selected application (applicant-visible
    // fields only: no Mentor, notes or history).
    const { data: placements, error: placementsError } = await this.supabase.client
      .from('intern_placements')
      .select(`
        application_id,
        status,
        company,
        department,
        start_date,
        end_date,
        internship:internships!intern_placements_internship_id_fkey ( title )
      `)
      .eq('applicant_id', row.id)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false });

    if (placementsError) {
      throw new InternalServerErrorException('Unable to load your placements');
    }

    const placementByApplication = new Map<string, ApplicantPlacementRow>();
    for (const placement of (placements ?? []) as ApplicantPlacementRow[]) {
      if (!placementByApplication.has(placement.application_id)) {
        placementByApplication.set(placement.application_id, placement);
      }
    }

    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone ?? null,
      location: row.location ?? null,
      profileData: row.profile_data ?? null,
      applications: ((applications ?? []) as ApplicantApplicationRow[]).map((application) => {
        const internship = Array.isArray(application.internships)
          ? application.internships[0]
          : application.internships;

        return {
          id: application.id,
          trainingTitle: internship?.title ?? application.requested_training ?? 'Training',
          trainingType: internship ? 'INTERNSHIP' as const : 'OTHER' as const,
          status: application.status,
          appliedAt: application.applied_at ?? application.created_at,
          submittedAt: application.submitted_at ?? null,
          rejectionReason: application.status === 'REJECTED' ? application.rejection_reason : null,
          placement: toApplicantPlacement(placementByApplication.get(application.id)),
        };
      }),
    };
  }
}

function toApplicantPlacement(placement: ApplicantPlacementRow | undefined) {
  if (!placement) {
    return null;
  }
  const internship = Array.isArray(placement.internship) ? placement.internship[0] : placement.internship;
  return {
    status: placement.status,
    company: placement.company,
    department: placement.department,
    startDate: placement.start_date,
    endDate: placement.end_date,
    trainingTitle: internship?.title ?? null,
  };
}
