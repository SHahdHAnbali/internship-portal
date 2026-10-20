import {
  Injectable,
  UnauthorizedException,
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
import { previousApplicationExists } from '../../domain/types/applicant-eligibility.js';
import { cvAlreadySubmitted } from '../../domain/types/cv-already-submitted.js';
import { parseTrainingTarget } from '../../domain/types/training-target.js';
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
    // The caller's own Supabase session, if signed in.
    accessToken: string | null = null,
  ) {
    // 0. Portal intake (ADMIN) before anything else: no parsing, storage or
    //    email while closed. The database re-checks when the draft is inserted.
    await assertApplicationIntakeOpen(this.supabase, 'newApplication');

    const { requestedTraining: cleanRequestedTraining } =
      parseTrainingTarget(internshipId, requestedTraining);

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

    // 2. Refuse a CV that was already submitted with any application (any
    //    status, training or applicant), before spending an AI call or
    //    storing anything. Checked before the one-application rule, so a
    //    re-used CV is reported as such.
    const cvSha256 =
      createHash('sha256').update(file.buffer).digest('hex');

    if (
      await this.applicationRepository.hasSubmittedApplicationForCv(
        cvSha256,
        null,
      )
    ) {
      throw cvAlreadySubmitted();
    }

    // Each applicant may apply only once. A signed-in applicant (or intern)
    // with a submitted application is refused before anything is parsed.
    if (accessToken) {
      await this.assertSessionMayApply(accessToken);
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

    //    The applicant is identified by this address: anyone who already
    //    submitted an application with it is refused before the CV is stored
    //    or a review link is sent, whatever the training or CV.
    if (
      await this.applicationRepository.hasSubmittedApplication({
        email: reviewEmail,
      })
    ) {
      throw previousApplicationExists();
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

  private async assertSessionMayApply(
    accessToken: string,
  ): Promise<void> {
    const { data, error } =
      await this.supabase.client.auth.getUser(accessToken);
    const user = data?.user;

    if (error || !user) {
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }

    if (
      await this.applicationRepository.hasSubmittedApplication({
        authUserId: user.id,
        email: normalizeReviewEmail(user.email),
      })
    ) {
      throw previousApplicationExists();
    }
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
