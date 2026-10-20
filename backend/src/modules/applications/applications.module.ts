import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';

import {
  ExportApplicationsUseCase,
  ListApplicationsUseCase,
} from './application/use-cases/list-applications.use-case.js';

import { GetApplicationCvUrlUseCase } from './application/use-cases/get-application-cv-url.use-case.js';

import { GetApplicationIntakeUseCase } from './application/use-cases/get-application-intake.use-case.js';

import { ReleaseApplicationSelectionUseCase } from './application/use-cases/release-application-selection.use-case.js';

import { UpdateApplicantProfileUseCase } from './application/use-cases/update-applicant-profile.use-case.js';

import { ApplicationRepository } from './domain/repositories/application.repository.js';

import { SupabaseApplicationRepository } from './infrastructure/repositories/supabase-application.repository.js';

import { CvStorageService } from './infrastructure/storage/cv-storage.service.js';

import { ApplicationsController } from './presentation/controllers/applications.controller.js';

import { ParseCvUseCase } from './application/use-cases/parse-cv.use-case.js';

import { CvTextExtractorService } from './infrastructure/parsing/cv-text-extractor.service.js';

import { SubmitApplicationUseCase } from './application/use-cases/submit-application.use-case.js';
import { CheckCvDuplicateUseCase } from './application/use-cases/check-cv-duplicate.use-case.js';
import { GetApplicantEligibilityUseCase } from './application/use-cases/get-applicant-eligibility.use-case.js';

import { GetApplicationReviewUseCase } from './application/use-cases/get-application-review.use-case.js';

import { AiCvParserService } from './infrastructure/ai/ai-cv-parser.service.js';

import { SubmitReviewedApplicationUseCase } from './application/use-cases/submit-reviewed-application.use-case.js';

import { ApplicationEmailService } from './infrastructure/email/application-email.service.js';

import { GetApplicationDetailsUseCase } from './application/use-cases/get-application-details.use-case.js';

import { UpdateApplicationStatusUseCase } from './application/use-cases/update-application-status.use-case.js';

import { AiApplicationMatcherService } from './infrastructure/ai/ai-application-matcher.service.js';

import { MatchApplicationUseCase } from './application/use-cases/match-application.use-case.js';

import { GetApplicationMatchUseCase } from './application/use-cases/get-application-match.use-case.js';

import { ApplicantAccountService } from './infrastructure/accounts/applicant-account.service.js';

import { ApplicantProfileController } from './presentation/controllers/applicant-profile.controller.js';
import { InternProfileController } from './presentation/controllers/intern-profile.controller.js';

import { GetApplicantProfileUseCase } from './application/use-cases/get-applicant-profile.use-case.js';



@Module({
  imports: [
    AuthModule,
    DatabaseModule,
  ],

  controllers: [
    InternProfileController,
    ApplicationsController,
    ApplicantProfileController,
   
  ],

  providers: [
    ListApplicationsUseCase,
    ExportApplicationsUseCase,
    GetApplicationCvUrlUseCase,
    UpdateApplicantProfileUseCase,
    ParseCvUseCase,
    SubmitApplicationUseCase,
    CheckCvDuplicateUseCase,
    GetApplicantEligibilityUseCase,
    GetApplicationReviewUseCase,
    CvStorageService,
    CvTextExtractorService,
    AiCvParserService,
    SubmitReviewedApplicationUseCase,
    ApplicationEmailService,
    GetApplicationDetailsUseCase,
    UpdateApplicationStatusUseCase,
    AiApplicationMatcherService,
    MatchApplicationUseCase,
    GetApplicationMatchUseCase,
    ApplicantAccountService,
    GetApplicationIntakeUseCase,
    ReleaseApplicationSelectionUseCase,
    GetApplicantProfileUseCase,
   
  
    {
      provide: ApplicationRepository,
      useClass: SupabaseApplicationRepository,
    },
  ],
})
export class ApplicationsModule {}
