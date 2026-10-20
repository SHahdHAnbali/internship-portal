import { Injectable } from '@nestjs/common';

import { ApplicationRepository } from '../../domain/repositories/application.repository.js';
import { normalizeReviewEmail } from '../../domain/types/review-email.js';

// Whether the signed-in user may start an application. Each applicant may
// apply only once: any earlier submitted application (any status, training or
// CV) makes them ineligible. The upload and the final submission enforce the
// same rule; this only lets the Apply page say so up front.
@Injectable()
export class GetApplicantEligibilityUseCase {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
  ) {}

  async execute(authUser: { id: string; email: string | null }): Promise<{ canApply: boolean }> {
    const alreadyApplied = await this.applicationRepository.hasSubmittedApplication({
      authUserId: authUser.id,
      email: normalizeReviewEmail(authUser.email),
    });
    return { canApply: !alreadyApplied };
  }
}
