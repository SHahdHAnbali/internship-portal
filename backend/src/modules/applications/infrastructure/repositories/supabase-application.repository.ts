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
  type ApplicantIdentity,
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

  async hasSubmittedApplicationForCv(
    cvSha256: string,
    excludeApplicationId: string | null,
  ): Promise<boolean> {
    let query = this.supabase.client
      .from('applications')
      .select('id')
      .eq('cv_sha256', cvSha256)
      .neq('status', 'DRAFT');
    if (excludeApplicationId) {
      query = query.neq('id', excludeApplicationId);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      throw new InternalServerErrorException(
        'Unable to check whether this CV was already submitted',
      );
    }

    return (data ?? []).length > 0;
  }

  async hasPreviousUploadOfCv(
    cvSha256: string,
    excludeApplicationId: string | null,
  ): Promise<boolean> {
    let query = this.supabase.client
      .from('applications')
      .select('id')
      .eq('cv_sha256', cvSha256);
    if (excludeApplicationId) {
      query = query.neq('id', excludeApplicationId);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      throw new InternalServerErrorException(
        'Unable to check for an earlier upload of this CV',
      );
    }

    return (data ?? []).length > 0;
  }

  async hasSubmittedApplication(
    identity: ApplicantIdentity,
  ): Promise<boolean> {
    const authUserId = identity.authUserId ?? null;
    const email = identity.email ?? null;
    if (!authUserId && !email) {
      return false;
    }

    const fail = () =>
      new InternalServerErrorException(
        'Unable to check for an earlier application',
      );

    // Applicant rows for this identity. Emails are compared like the database
    // does (lower(btrim(email))); legacy rows may differ in case.
    const applicantIds = new Set<string>();
    const [byAuth, byEmail] = await Promise.all([
      authUserId
        ? this.supabase.client.from('applicants').select('id').eq('auth_user_id', authUserId)
        : null,
      email
        ? this.supabase.client.from('applicants').select('id, email').ilike('email', likePattern(email))
        : null,
    ]);
    if (byAuth?.error || byEmail?.error) throw fail();
    for (const row of (byAuth?.data ?? []) as { id: string }[]) {
      applicantIds.add(row.id);
    }
    for (const row of (byEmail?.data ?? []) as { id: string; email: string | null }[]) {
      // The pattern can match more than the exact address.
      if (row.email?.trim().toLowerCase() === email) applicantIds.add(row.id);
    }

    const checks = [];
    if (applicantIds.size > 0) {
      checks.push(
        this.supabase.client
          .from('applications')
          .select('id')
          .in('applicant_id', [...applicantIds])
          .neq('status', 'DRAFT')
          .limit(1),
      );
    }
    if (email) {
      // Submitted applications always store their normalized review email.
      checks.push(
        this.supabase.client
          .from('applications')
          .select('id')
          .eq('review_email', email)
          .neq('status', 'DRAFT')
          .limit(1),
      );
    }
    for (const { data, error } of await Promise.all(checks)) {
      if (error) throw fail();
      if ((data ?? []).length > 0) return true;
    }
    return false;
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

// ILIKE pattern for an email address: LIKE wildcards are escaped; '*' (which
// PostgREST turns into '%') becomes a one-character wildcard. Matches are
// then compared exactly.
function likePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
}
