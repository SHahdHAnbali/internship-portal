import {
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { createHash } from 'node:crypto';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

import { normalizeReviewEmail } from '../../domain/types/review-email.js';
import { assertApplicationIntakeOpen } from '../../infrastructure/intake/application-intake.js';

// Review tokens are 32 random bytes encoded as base64url (43 characters).
export const REVIEW_TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

export const REVIEW_LINK_NOT_FOUND = 'REVIEW_LINK_NOT_FOUND';
export const REVIEW_LINK_USED = 'REVIEW_LINK_USED';
export const REVIEW_LINK_EXPIRED = 'REVIEW_LINK_EXPIRED';

function reviewLinkError(status: 'not_found' | 'gone', code: string, message: string) {
  const body = { statusCode: status === 'gone' ? 410 : 404, error: status === 'gone' ? 'Gone' : 'Not Found', code, message };
  return status === 'gone' ? new GoneException(body) : new NotFoundException(body);
}

@Injectable()
export class GetApplicationReviewUseCase {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async execute(reviewToken: string) {
    if (!REVIEW_TOKEN_SHAPE.test(reviewToken)) {
      throw reviewLinkError('not_found', REVIEW_LINK_NOT_FOUND, 'This review link is not valid.');
    }

    const reviewTokenHash = createHash('sha256').update(reviewToken).digest('hex');

    const { data, error } = await this.supabase.client
      .from('applications')
      .select(`
        id,
        status,
        review_token_expires_at,
        review_token_used_at,
        review_email,
        extracted_data,
        requested_training,
        internships ( id, title )
      `)
      .eq('review_token_hash', reviewTokenHash)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load application review');
    }

    if (!data) {
      throw reviewLinkError('not_found', REVIEW_LINK_NOT_FOUND, 'This review link is not valid.');
    }

    // Submitted (no longer a draft) or already consumed: one use only.
    if (data.status !== 'DRAFT' || data.review_token_used_at) {
      throw reviewLinkError(
        'gone',
        REVIEW_LINK_USED,
        'This review link has already been used. Sign in to see your application.',
      );
    }

    if (
      !data.review_token_expires_at ||
      new Date(data.review_token_expires_at).getTime() <= Date.now()
    ) {
      throw reviewLinkError(
        'gone',
        REVIEW_LINK_EXPIRED,
        'This review link has expired. Please submit your CV again to receive a new link.',
      );
    }

    // A valid, unused link while intake is closed: nothing is returned and the
    // draft is kept as it is (409 APPLICATIONS_CLOSED).
    await assertApplicationIntakeOpen(this.supabase, 'review');

    const internship = Array.isArray(data.internships)
      ? data.internships[0]
      : data.internships;

    // The address the link was sent to. It is fixed for this draft and the
    // reviewed submission must keep it unchanged.
    const extractedData =
      data.extracted_data && typeof data.extracted_data === 'object'
        ? (data.extracted_data as Record<string, unknown>)
        : null;

    const reviewEmail = normalizeReviewEmail(
      data.review_email ?? extractedData?.email,
    );

    return {
      applicationId: data.id,
      reviewEmail,
      internship: internship
        ? { id: internship.id, title: internship.title }
        : null,
      requestedTraining: data.requested_training ?? null,
      extractedData: extractedData
        ? { ...extractedData, email: reviewEmail }
        : null,
    };
  }
}
