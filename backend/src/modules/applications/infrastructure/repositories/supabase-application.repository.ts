import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  createHash,
  randomBytes,
} from 'node:crypto';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { applicationsClosed, isApplicationsClosedError } from '../intake/application-intake.js';

import { Application } from '../../domain/entities/application.entity.js';
import { ApplicationStatus } from '../../domain/enums/application-status.enum.js';

import {
  ApplicationRepository,
  type CreateDraftInput,
  type CreatedDraft,
} from '../../domain/repositories/application.repository.js';

interface ApplicantRelation {
  full_name: string;
  email: string;
}

interface InternshipRelation {
  title: string;
}

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  applied_at: string;
  submitted_at: string | null;
  requested_training: string | null;
  cv_path: string | null;
  applicants: ApplicantRelation | ApplicantRelation[] | null;
  internships: InternshipRelation | InternshipRelation[] | null;
}

const REVIEW_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SupabaseApplicationRepository
  implements ApplicationRepository
{
  constructor(
    private readonly supabase:
      SupabaseService,
  ) {}

  async createDraft(
    input: CreateDraftInput,
  ): Promise<CreatedDraft> {
    // The raw token is only ever sent in the review email; the database
    // stores its SHA-256 hash.
    const reviewToken =
      randomBytes(32).toString('base64url');

    const reviewTokenHash =
      createHash('sha256')
        .update(reviewToken)
        .digest('hex');

    const reviewTokenExpiresAt =
      new Date(Date.now() + REVIEW_LINK_LIFETIME_MS).toISOString();

    const { data, error } =
      await this.supabase.client
        .from('applications')
        .insert({
          internship_id: input.internshipId,
          requested_training: input.requestedTraining,
          cv_path: input.cvPath,
          cv_sha256: input.cvSha256,
          applicant_id: null,
          // While DRAFT both hold the AI extraction; the review later replaces
          // extracted_data, while original_extracted_data never changes.
          extracted_data: input.extractedData,
          original_extracted_data: input.extractedData,
          review_email: input.reviewEmail,
          status: 'DRAFT',
          review_token_hash: reviewTokenHash,
          review_token_expires_at: reviewTokenExpiresAt,
          review_token_used_at: null,
        })
        .select(`
          id,
          internship_id,
          requested_training,
          cv_path,
          status,
          created_at
        `)
        .single();

    if (error) {
      if (isApplicationsClosedError(error)) {
        throw applicationsClosed('newApplication');
      }
      throw new InternalServerErrorException(
        'Unable to save your application draft',
      );
    }

    return {
      id: data.id,
      internshipId: data.internship_id,
      requestedTraining: data.requested_training,
      cvPath: data.cv_path,
      reviewToken,
      status: data.status as 'DRAFT',
      createdAt: data.created_at,
    };
  }

  async hasActiveApplicationForCv(
    cvSha256: string,
    internshipId: string | null,
    requestedTraining: string | null,
  ): Promise<boolean> {
    const { data, error } =
      await this.supabase.client
        .from('applications')
        .select('internship_id, requested_training')
        .eq('cv_sha256', cvSha256)
        .not('status', 'in', '(DRAFT,REJECTED)');

    if (error) {
      throw new InternalServerErrorException(
        'Unable to check for an existing application',
      );
    }

    const target = trainingTarget(internshipId, requestedTraining);
    return (data ?? []).some(
      (row: { internship_id: string | null; requested_training: string | null }) =>
        trainingTarget(row.internship_id, row.requested_training) === target,
    );
  }

  async deleteUnsubmittedDraft(
    id: string,
  ): Promise<void> {
    const { error } =
      await this.supabase.client
        .from('applications')
        .delete()
        .eq('id', id)
        .eq('status', 'DRAFT')
        .is('applicant_id', null)
        .is('review_token_used_at', null);

    if (error) {
      throw new InternalServerErrorException(
        'Unable to remove the unsent application draft',
      );
    }
  }

  async findAll(): Promise<Application[]> {
    const { data, error } =
      await this.supabase.client
        .from('applications')
        .select(`
          id,
          status,
          applied_at,
          submitted_at,
          requested_training,
          cv_path,

          applicants (
            full_name,
            email
          ),

          internships (
            title
          )
        `)
        .neq('status', 'DRAFT');

    if (error) {
      throw new InternalServerErrorException(
        'Unable to load applications',
      );
    }

    return ((data ?? []) as ApplicationRow[])
      .map((row) => this.toDomain(row))
      .filter(
        (application): application is Application =>
          application !== null,
      );
  }

  private toDomain(
    row: ApplicationRow,
  ): Application | null {
    const applicant = normalizeRelation(row.applicants);
    const internship = normalizeRelation(row.internships);

    if (!applicant) {
      return null;
    }

    const trainingTitle =
      internship?.title ?? row.requested_training;

    if (!trainingTitle) {
      return null;
    }

    return new Application(
      row.id,
      applicant.full_name,
      applicant.email,
      trainingTitle,
      new Date(row.applied_at),
      row.submitted_at ? new Date(row.submitted_at) : null,
      row.status,
      Boolean(row.cv_path),
    );
  }
}

// Same normalization as the database duplicate index.
function trainingTarget(
  internshipId: string | null,
  requestedTraining: string | null,
): string {
  return internshipId ?? `other:${(requestedTraining ?? '').trim().toLowerCase()}`;
}

function normalizeRelation<T>(
  relation: T | T[] | null,
): T | null {
  if (!relation) {
    return null;
  }

  return Array.isArray(relation)
    ? relation[0] ?? null
    : relation;
}
