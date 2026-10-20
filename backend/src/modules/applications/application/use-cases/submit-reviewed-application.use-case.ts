import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';
import { applicationsClosed, assertApplicationIntakeOpen } from '../../infrastructure/intake/application-intake.js';
import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { ApplicantAccountService } from '../../infrastructure/accounts/applicant-account.service.js';
import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';
import { normalizeReviewEmail } from '../../domain/types/review-email.js';
import { previousApplicationExists } from '../../domain/types/applicant-eligibility.js';
import { cvAlreadySubmitted } from '../../domain/types/cv-already-submitted.js';
import { ApplicationRepository } from '../../domain/repositories/application.repository.js';

export const ACCOUNT_SIGN_IN_REQUIRED = 'ACCOUNT_SIGN_IN_REQUIRED';

import { REVIEW_TOKEN_SHAPE } from './get-application-review.use-case.js';

interface ReviewApplicationRow {
  id: string;
  applicant_id: string | null;
  status: string;
  review_email: string | null;
  extracted_data: { email?: unknown } | null;
  review_token_expires_at: string | null;
  review_token_used_at: string | null;
  cv_sha256: string | null;
}

interface SubmittedReviewRow {
  application_id: string;
  applicant_id: string;
  status: 'NEW';
  submitted_at: string;
}

interface RpcError {
  code?: string;
  message?: string;
}

interface ReviewIdentity {
  authUserId: string;
  accountCreated: boolean;
}

@Injectable()
export class SubmitReviewedApplicationUseCase {
  private readonly logger = new Logger(SubmitReviewedApplicationUseCase.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly applicantAccountService: ApplicantAccountService,
    private readonly applicationRepository: ApplicationRepository,
  ) {}

  // accessToken is the caller's own Supabase session, if any. It is required
  // when an account already exists for the review email.
  async execute(
    reviewToken: string,
    data: ExtractedCvData,
    accessToken: string | null = null,
  ) {
    if (!REVIEW_TOKEN_SHAPE.test(reviewToken)) {
      throw new NotFoundException('Application not found');
    }

    const reviewTokenHash = createHash('sha256')
      .update(reviewToken)
      .digest('hex');

    // Early, non-locking validation so no Auth account is created for an
    // unusable link. The RPC repeats every check under the row lock.
    const { data: application, error: applicationError } =
      await this.supabase.client
        .from('applications')
        .select(`
          id,
          applicant_id,
          status,
          review_email,
          extracted_data,
          review_token_expires_at,
          review_token_used_at,
          cv_sha256
        `)
        .eq('review_token_hash', reviewTokenHash)
        .maybeSingle();

    if (applicationError) {
      throw new InternalServerErrorException('Unable to verify application review link');
    }
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const reviewApplication = application as ReviewApplicationRow;
    this.assertReviewable(reviewApplication);

    // Before any account is created or verified: no Auth user, applicant or
    // profile while intake is closed. The database function re-checks under
    // the settings lock; if intake closes in between, the account created
    // below is removed by handleFailureAfterAccountCreation.
    await assertApplicationIntakeOpen(this.supabase, 'review');

    // Legacy drafts have no review_email; their link was sent to the address
    // in the originally extracted data.
    const reviewEmail = normalizeReviewEmail(
      reviewApplication.review_email ?? reviewApplication.extracted_data?.email,
    );
    if (!reviewEmail) {
      throw new ConflictException(
        'This review link can no longer be used. Please submit a new application.',
      );
    }

    if (normalizeReviewEmail(data.email) !== reviewEmail) {
      throw new BadRequestException(
        'The email address cannot be changed during review. It must match the address this review link was sent to.',
      );
    }

    const fullName = data.fullName?.trim();
    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    const reviewedData: ExtractedCvData = { ...data, email: reviewEmail };

    // A CV already submitted with another application cannot be used again;
    // checked before the one-application rule, so a re-used CV is reported
    // as such. Refused before any account is created or verified.
    if (
      reviewApplication.cv_sha256 &&
      (await this.applicationRepository.hasSubmittedApplicationForCv(
        reviewApplication.cv_sha256,
        reviewApplication.id,
      ))
    ) {
      throw cvAlreadySubmitted();
    }

    // One application per applicant, ever: refused before any account is
    // created or verified, whatever the training or CV.
    if (await this.applicationRepository.hasSubmittedApplication({ email: reviewEmail })) {
      throw previousApplicationExists();
    }

    if (accessToken) {
      const authUserId = await this.verifySessionForReview(accessToken, reviewEmail);
      if (await this.applicationRepository.hasSubmittedApplication({ authUserId, email: reviewEmail })) {
        throw previousApplicationExists();
      }
      return this.submit(reviewApplication.id, reviewTokenHash, reviewedData, {
        authUserId,
        accountCreated: false,
      });
    }

    // A legacy draft already linked to an applicant belongs to an existing
    // account; only that account's signed-in owner may submit it.
    if (reviewApplication.applicant_id) {
      throw signInRequired();
    }

    const account = await this.applicantAccountService.createReviewedApplicantAuthUser(
      reviewEmail,
      fullName,
    );
    if (account.status === 'exists') {
      throw signInRequired();
    }

    return this.submit(reviewApplication.id, reviewTokenHash, reviewedData, {
      authUserId: account.authUserId,
      accountCreated: true,
    });
  }

  private async verifySessionForReview(
    accessToken: string,
    reviewEmail: string,
  ): Promise<string> {
    const { data, error } = await this.supabase.client.auth.getUser(accessToken);
    const user = data?.user;

    if (error || !user) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    if (normalizeReviewEmail(user.email) !== reviewEmail) {
      throw new ForbiddenException(
        'You are signed in with a different account. Sign out, then sign in with the email address this review link was sent to.',
      );
    }

    if (!user.email_confirmed_at) {
      throw new ForbiddenException(
        'Please confirm your email address before submitting your application.',
      );
    }

    return user.id;
  }

  private async submit(
    applicationId: string,
    reviewTokenHash: string,
    reviewedData: ExtractedCvData,
    identity: ReviewIdentity,
  ) {
    let rpcResult: { data: unknown; error: RpcError | null };
    try {
      rpcResult = await this.supabase.client.rpc('submit_application_review_v2', {
        p_review_token_hash: reviewTokenHash,
        p_extracted_data: reviewedData,
        p_auth_user_id: identity.authUserId,
        p_account_created: identity.accountCreated,
      });
    } catch {
      // The request may or may not have reached the database.
      rpcResult = { data: null, error: { message: 'request_failed' } };
    }

    const { data: result, error } = rpcResult;

    if (error) {
      if (identity.accountCreated) {
        await this.handleFailureAfterAccountCreation(applicationId, identity.authUserId, error);
      }
      throwReviewRpcError(error);
    }

    if (!Array.isArray(result) || result.length !== 1 || !isSubmittedReviewRow(result[0])) {
      // A malformed or empty response does not prove the transaction rolled
      // back, so a newly created account must not be deleted here.
      if (identity.accountCreated) {
        this.logReconciliation(applicationId, identity.authUserId);
      }
      throw new InternalServerErrorException(
        'Application review submission returned an invalid result',
      );
    }

    const submitted = result[0];
    return {
      applicationId: submitted.application_id,
      status: submitted.status,
      submittedAt: submitted.submitted_at,
      message: 'Application submitted successfully.',
    };
  }

  // Auth and the database do not share a transaction. The account created by
  // this request is removed only when the database definitively rolled back,
  // which guarantees no profile, applicant, or application references it.
  private async handleFailureAfterAccountCreation(
    applicationId: string,
    authUserId: string,
    error: RpcError,
  ): Promise<void> {
    if (!isDefiniteDatabaseFailure(error)) {
      this.logReconciliation(applicationId, authUserId);
      throw new ServiceUnavailableException(
        'We could not confirm whether your application was submitted. Please wait a moment, then open your review link again.',
      );
    }

    const deleted = await this.applicantAccountService
      .deleteUnlinkedAuthUser(authUserId)
      .catch(() => false);

    if (!deleted) {
      this.logger.warn(
        `Unlinked Auth user could not be removed after a rolled-back review submission; auth user ${authUserId} requires cleanup`,
      );
    }
  }

  private logReconciliation(applicationId: string, authUserId: string): void {
    this.logger.warn(
      `Review submission outcome unknown; auth user ${authUserId} and application ${applicationId} require reconciliation`,
    );
  }

  private assertReviewable(application: ReviewApplicationRow): void {
    if (application.status !== 'DRAFT' || application.review_token_used_at) {
      throw new BadRequestException(
        'This review link is no longer valid or has already been used',
      );
    }

    if (
      !application.review_token_expires_at ||
      new Date(application.review_token_expires_at).getTime() <= Date.now()
    ) {
      throw new BadRequestException('This review link has expired');
    }
  }
}

function signInRequired(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: ACCOUNT_SIGN_IN_REQUIRED,
    message:
      'An applicant account already exists for this email address. Sign in with this email address, then open your review link again to submit your application.',
  });
}

// PostgreSQL SQLSTATEs (including the project's PZxxx codes) and PostgREST
// PGRSTxxx codes are only returned once the statement has failed and its
// transaction has rolled back. Anything else (network errors, timeouts) is
// treated as an unknown outcome.
function isDefiniteDatabaseFailure(error: RpcError): boolean {
  return typeof error.code === 'string' &&
    (/^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d+$/.test(error.code));
}

const DUPLICATE_APPLICATION_MESSAGE =
  'You have already applied for this training.';

const UNSAFE_LINK_MESSAGE =
  'We could not safely link this application to an applicant account. Please contact the recruitment team.';

function throwReviewRpcError(error: RpcError): never {
  if (!isDefiniteDatabaseFailure(error)) {
    throw new ServiceUnavailableException(
      'We could not confirm whether your application was submitted. Please wait a moment, then open your review link again.',
    );
  }

  switch (error.message) {
    case 'applications_closed':
      throw applicationsClosed('review');
    case 'review_email_mismatch':
      throw new BadRequestException(
        'The email address cannot be changed during review. It must match the address this review link was sent to.',
      );
    case 'review_name_required':
      throw new BadRequestException('Full name is required');
    case 'review_token_expired':
      throw new BadRequestException('This review link has expired');
    case 'review_token_already_used':
    case 'review_token_no_longer_valid':
      throw new ConflictException('This review link is no longer valid or has already been used');
    case 'application_review_not_found':
      throw new NotFoundException('Application not found');
    case 'staff_account_not_eligible':
      throw new ForbiddenException(
        'This account cannot be used to submit an applicant application.',
      );
    case 'previous_application_exists':
      // Raised under the per-applicant lock (migration 20261021000000), e.g.
      // when two drafts of the same applicant are submitted at once.
      throw previousApplicationExists();
    case 'duplicate_application':
      throw new ConflictException(DUPLICATE_APPLICATION_MESSAGE);
    case 'review_email_unavailable':
      throw new ConflictException(
        'This review link can no longer be used. Please submit a new application.',
      );
    case 'applicant_identity_conflict':
    case 'legacy_review_owner_mismatch':
    case 'review_account_email_mismatch':
    case 'review_account_state_conflict':
      throw new ConflictException(UNSAFE_LINK_MESSAGE);
    default:
      if (error.code === '23505') {
        // Race-safe backstops for the duplicate checks above.
        if (/applications_(cv_sha256_active_target_key|applicant_other_training_key|applicant_id_internship_id_key)/.test(error.message ?? '')) {
          throw new ConflictException(DUPLICATE_APPLICATION_MESSAGE);
        }
        throw new ConflictException(UNSAFE_LINK_MESSAGE);
      }
      throwSupabaseRpcHttpException(error);
  }
}

function isSubmittedReviewRow(value: unknown): value is SubmittedReviewRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.application_id === 'string' && row.application_id !== '' &&
    typeof row.applicant_id === 'string' && row.applicant_id !== '' &&
    row.status === 'NEW' &&
    typeof row.submitted_at === 'string' && row.submitted_at !== '';
}
