import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { createHash } from 'node:crypto';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

import { ApplicationRepository } from '../../domain/repositories/application.repository.js';

import { normalizeReviewEmail } from '../../domain/types/review-email.js';
import { assertApplicationIntakeOpen } from '../../infrastructure/intake/application-intake.js';

import { CvStorageService } from '../../infrastructure/storage/cv-storage.service.js';

import { CvTextExtractorService } from '../../infrastructure/parsing/cv-text-extractor.service.js';

import { AiCvParserService } from '../../infrastructure/ai/ai-cv-parser.service.js';

import { ApplicationEmailService } from '../../infrastructure/email/application-email.service.js';

@Injectable()
export class SubmitApplicationUseCase {
  private readonly logger = new Logger(SubmitApplicationUseCase.name);

  constructor(
    private readonly applicationRepository:
      ApplicationRepository,

    private readonly cvStorageService:
      CvStorageService,

    private readonly cvTextExtractorService:
      CvTextExtractorService,

    private readonly supabase:
      SupabaseService,

    private readonly aiCvParserService:
      AiCvParserService,

    private readonly applicationEmailService:
      ApplicationEmailService,
  ) {}

  async execute(
    internshipId: string | null,
    requestedTraining: string | null,
    file: Express.Multer.File | undefined,
  ) {
    // 0. Portal intake (ADMIN) before anything else: no parsing, storage or
    //    email while closed. The database re-checks when the draft is inserted.
    await assertApplicationIntakeOpen(this.supabase, 'newApplication');

    const cleanRequestedTraining =
      requestedTraining?.trim() || null;

    if (
      !internshipId &&
      !cleanRequestedTraining
    ) {
      throw new BadRequestException(
        'Please select an internship or enter the training area you are interested in.',
      );
    }

    if (
      internshipId &&
      cleanRequestedTraining
    ) {
      throw new BadRequestException(
        'Choose either an available internship or another training area, not both.',
      );
    }

    this.cvStorageService.assertValidFile(file);

    let trainingTitle: string;

    // 1. Validate selected internship
    if (internshipId) {
      const {
        data: internship,
        error,
      } =
        await this.supabase.client
          .from('internships')
          .select(`
            id,
            title,
            is_active
          `)
          .eq(
            'id',
            internshipId,
          )
          .maybeSingle();

      if (error) {
        throw new InternalServerErrorException(
          'Unable to verify the selected internship',
        );
      }

      if (!internship) {
        throw new NotFoundException(
          'Internship not found',
        );
      }

      if (!internship.is_active) {
        throw new NotFoundException(
          'Internship is not active',
        );
      }

      trainingTitle =
        internship.title;
    } else {
      trainingTitle =
        cleanRequestedTraining!;
    }

    // 2. Refuse a CV that is already part of an active application for the
    //    same training, before spending an AI call or storing anything.
    const cvSha256 =
      createHash('sha256').update(file.buffer).digest('hex');

    if (
      await this.applicationRepository.hasActiveApplicationForCv(
        cvSha256,
        internshipId,
        cleanRequestedTraining,
      )
    ) {
      throw new ConflictException(
        'This CV has already been submitted for this training.',
      );
    }

    // 3. Extract structured CV data before storing anything, so an
    //    unreadable CV leaves no file or draft behind.
    const text =
      await this.cvTextExtractorService.extractText(
        file.buffer,
        file.mimetype,
      );

    const extractedData =
      await this.aiCvParserService.parse(
        text,
      );

    // 4. The review link is sent to this address and the draft is bound to it.
    //    No Auth user, applicant, or profile is created until it is used.
    const reviewEmail =
      normalizeReviewEmail(
        extractedData.email,
      );

    if (!reviewEmail) {
      throw new UnprocessableEntityException(
        'We could not find a valid email address in your CV. Please add your email address to your CV and try again.',
      );
    }

    // 5. Upload CV
    const cvPath =
      await this.cvStorageService.upload(
        file,
      );

    // 6. Create DRAFT application with the extracted data and review email
    let draft: Awaited<ReturnType<ApplicationRepository['createDraft']>>;
    try {
      draft =
        await this.applicationRepository.createDraft({
          internshipId,
          requestedTraining:
            cleanRequestedTraining,
          cvPath,
          cvSha256,
          extractedData: {
            ...extractedData,
            email: reviewEmail,
          },
          reviewEmail,
        });
    } catch (error) {
      await this.removeUploadedCv(cvPath);
      throw error;
    }

    // 7. Send review email. A draft whose link was never delivered can never
    //    be reviewed, so it is removed together with its file.
    try {
      await this.applicationEmailService.sendReviewEmail(
        reviewEmail,
        draft.reviewToken,
        trainingTitle,
      );
    } catch {
      await this.removeUnsentDraft(draft.id, cvPath);

      throw new ServiceUnavailableException(
        'We could not send your review email. Please try again.',
      );
    }

    // 8. Return response
    return {
      applicationId:
        draft.id,

      status:
        draft.status,

      message:
        'Application received successfully.',
    };
  }

  private async removeUnsentDraft(
    draftId: string,
    cvPath: string,
  ): Promise<void> {
    try {
      await this.applicationRepository.deleteUnsubmittedDraft(
        draftId,
      );
    } catch {
      this.logger.warn(
        `Unsent application draft requires cleanup: ${draftId}`,
      );
      return;
    }

    await this.removeUploadedCv(cvPath);
  }

  private async removeUploadedCv(
    cvPath: string,
  ): Promise<void> {
    const removed =
      await this.cvStorageService
        .remove(cvPath)
        .catch(() => false);

    if (!removed) {
      this.logger.warn(
        `Uploaded CV file requires cleanup: ${cvPath}`,
      );
    }
  }
}
