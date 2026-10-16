import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

import { TrainingDemandService } from './training-demand.service.js';

import type {
  HrDashboardResponse,
} from './hr-dashboard.types.js';

@Injectable()
export class HrDashboardService {
  constructor(
    private readonly supabaseService:
      SupabaseService,

    private readonly trainingDemandService:
      TrainingDemandService,
  ) {}

  async getDashboard(): Promise<HrDashboardResponse> {
    const supabase =
      this.supabaseService.client;

    const {
      data: applications,
      error: applicationsError,
    } = await supabase
      .from('applications')
      .select(`
        id,
        status,
        submitted_at,
        created_at,
        requested_training,

        applicants (
          full_name,
          email
        ),

        internships (
          id,
          title,
          is_active
        )
      `)
      .neq('status', 'DRAFT')
      .order('submitted_at', {
        ascending: false,
        nullsFirst: false,
      });

    if (applicationsError) {
      throw new InternalServerErrorException(
        applicationsError.message,
      );
    }

    const {
      data: internships,
      error: internshipsError,
    } = await supabase
      .from('internships')
      .select(`
        id,
        is_active
      `);

    if (internshipsError) {
      throw new InternalServerErrorException(
        internshipsError.message,
      );
    }

    const rows =
      applications ?? [];

    const internshipRows =
      internships ?? [];

    const countByStatus = (
      status: string,
    ) =>
      rows.filter(
        (application) =>
          application.status === status,
      ).length;

    const totalApplications =
      rows.length;

    const pendingReview =
      countByStatus('NEW') +
      countByStatus('UNDER_REVIEW');

    const activeInternships =
      internshipRows.filter(
        (internship) =>
          internship.is_active === true,
      ).length;

    const upcomingInterviews =
      countByStatus('INTERVIEW');

    const pipeline = [
      {
        status: 'NEW',
        label: 'New',
        count: countByStatus('NEW'),
      },

      {
        status: 'UNDER_REVIEW',
        label: 'Under Review',
        count:
          countByStatus(
            'UNDER_REVIEW',
          ),
      },

      {
        status: 'SHORTLISTED',
        label: 'Shortlisted',
        count:
          countByStatus(
            'SHORTLISTED',
          ),
      },

      {
        status: 'INTERVIEW',
        label: 'Interview',
        count:
          countByStatus(
            'INTERVIEW',
          ),
      },

      {
        status: 'SELECTED',
        label: 'Selected',
        count:
          countByStatus(
            'SELECTED',
          ),
      },

      {
        status: 'REJECTED',
        label: 'Rejected',
        count:
          countByStatus(
            'REJECTED',
          ),
      },
    ];

    const recentApplications =
      rows
        .slice(0, 5)
        .map((application) => {
          const applicant =
            Array.isArray(
              application.applicants,
            )
              ? application.applicants[0]
              : application.applicants;

          const internship =
            Array.isArray(
              application.internships,
            )
              ? application.internships[0]
              : application.internships;

          return {
            id:
              application.id,

            applicantName:
              applicant?.full_name ??
              'Unknown Applicant',

            internshipTitle:
              internship?.title ??
              application.requested_training ??
              'Other Training',

            status:
              application.status,

            createdAt:
              application.submitted_at ??
              application.created_at,
          };
        });

    const upcomingInterviewList =
      rows
        .filter(
          (application) =>
            application.status ===
            'INTERVIEW',
        )
        .slice(0, 5)
        .map((application) => {
          const applicant =
            Array.isArray(
              application.applicants,
            )
              ? application.applicants[0]
              : application.applicants;

          const internship =
            Array.isArray(
              application.internships,
            )
              ? application.internships[0]
              : application.internships;

          return {
            id:
              application.id,

            applicantName:
              applicant?.full_name ??
              'Unknown Applicant',

            internshipTitle:
              internship?.title ??
              application.requested_training ??
              'Other Training',

            scheduledAt:
              application.submitted_at ??
              application.created_at,

            status:
              application.status,
          };
        });

    const trainingDemand =
      await this.trainingDemandService.getDemand();

    return {
      stats: {
        totalApplications,
        pendingReview,
        activeInternships,
        upcomingInterviews,
      },

      pipeline,

      trainingDemand,

      recentApplications,

      upcomingInterviewList,
    };
  }
}