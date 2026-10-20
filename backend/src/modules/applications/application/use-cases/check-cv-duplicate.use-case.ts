import { Injectable } from '@nestjs/common';

import { ApplicationRepository } from '../../domain/repositories/application.repository.js';
import { parseTrainingTarget } from '../../domain/types/training-target.js';

export interface CvCheckResult {
  // The CV rule (POST /applications/submit and the final review): this exact
  // CV file is already part of a submitted application (any status, training
  // or applicant), so it cannot be used for another application.
  duplicate: boolean;
  // Warning only: this exact file was uploaded before for any application,
  // drafts included. It does not block anything.
  previouslyUploaded: boolean;
}

// Early, read-only CV check for the Apply page. The browser sends the SHA-256
// of the file it is about to upload (the fingerprint the server stores as
// applications.cv_sha256). Only two yes/no answers are returned: never who
// uploaded the file, for which training or when. Nothing is stored, and the
// submission and the final review keep their own checks.
@Injectable()
export class CheckCvDuplicateUseCase {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
  ) {}

  async execute(
    cvSha256: string,
    internshipId: string | null,
    requestedTraining: string | null,
  ): Promise<CvCheckResult> {
    const hash = cvSha256.toLowerCase();
    // A training is optional and does not change the answer; when one is
    // given, it is validated like the upload does.
    if (Boolean(internshipId) || Boolean(requestedTraining?.trim())) {
      parseTrainingTarget(internshipId, requestedTraining);
    }

    const [duplicate, previouslyUploaded] = await Promise.all([
      this.applicationRepository.hasSubmittedApplicationForCv(hash, null),
      this.applicationRepository.hasPreviousUploadOfCv(hash, null),
    ]);

    return { duplicate, previouslyUploaded };
  }
}
