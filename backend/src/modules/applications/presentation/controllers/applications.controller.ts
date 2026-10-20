import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import type { Response } from 'express';

import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { parseOptionalBearerToken } from '../../../../infrastructure/auth/optional-bearer-token.js';

import { SubmitApplicationUseCase } from '../../application/use-cases/submit-application.use-case.js';
import { CheckCvDuplicateUseCase } from '../../application/use-cases/check-cv-duplicate.use-case.js';
import { GetApplicantEligibilityUseCase } from '../../application/use-cases/get-applicant-eligibility.use-case.js';

import {
  ExportApplicationsUseCase,
  ListApplicationsUseCase,
} from '../../application/use-cases/list-applications.use-case.js';

import { ParseCvUseCase } from '../../application/use-cases/parse-cv.use-case.js';

import { GetApplicationReviewUseCase } from '../../application/use-cases/get-application-review.use-case.js';

import { SubmitReviewedApplicationUseCase } from '../../application/use-cases/submit-reviewed-application.use-case.js';

import { MatchApplicationUseCase } from '../../application/use-cases/match-application.use-case.js';

import { GetApplicationMatchUseCase } from '../../application/use-cases/get-application-match.use-case.js';

import { GetApplicationDetailsUseCase } from '../../application/use-cases/get-application-details.use-case.js';

import { GetApplicationCvUrlUseCase } from '../../application/use-cases/get-application-cv-url.use-case.js';

import { UpdateApplicationStatusUseCase } from '../../application/use-cases/update-application-status.use-case.js';

import { GetApplicationIntakeUseCase } from '../../application/use-cases/get-application-intake.use-case.js';

import { ReleaseApplicationSelectionUseCase } from '../../application/use-cases/release-application-selection.use-case.js';

import { ReleaseApplicationSelectionDto } from '../dto/release-application-selection.dto.js';

import { SubmitReviewedApplicationDto } from '../dto/submit-reviewed-application.dto.js';

import { UpdateApplicationStatusDto } from '../dto/update-application-status.dto.js';

import { SubmitApplicationDto } from '../dto/submit-application.dto.js';
import { CheckCvDuplicateDto } from '../dto/check-cv-duplicate.dto.js';

import { ListApplicationsQueryDto } from '../dto/list-applications-query.dto.js';

// Applications enter the system only through the public CV upload
// (POST /applications/submit) followed by the emailed one-time review
// (POST /applications/review/:reviewToken/submit). Every other route is
// HR-only and treats unsubmitted drafts as not found.
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly listApplicationsUseCase:
      ListApplicationsUseCase,

    private readonly exportApplicationsUseCase:
      ExportApplicationsUseCase,

    private readonly parseCvUseCase:
      ParseCvUseCase,

    private readonly submitApplicationUseCase:
      SubmitApplicationUseCase,

    private readonly getApplicationReviewUseCase:
      GetApplicationReviewUseCase,

    private readonly submitReviewedApplicationUseCase:
      SubmitReviewedApplicationUseCase,

    private readonly getApplicationDetailsUseCase:
      GetApplicationDetailsUseCase,

    private readonly getApplicationCvUrlUseCase:
      GetApplicationCvUrlUseCase,

    private readonly updateApplicationStatusUseCase:
      UpdateApplicationStatusUseCase,

    private readonly matchApplicationUseCase:
      MatchApplicationUseCase,

    private readonly getApplicationMatchUseCase:
      GetApplicationMatchUseCase,

    private readonly getApplicationIntakeUseCase:
      GetApplicationIntakeUseCase,

    private readonly releaseApplicationSelectionUseCase:
      ReleaseApplicationSelectionUseCase,

    private readonly checkCvDuplicateUseCase:
      CheckCvDuplicateUseCase,

    private readonly getApplicantEligibilityUseCase:
      GetApplicantEligibilityUseCase,
  ) {}

  @Get()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getApplications(
    @Query() query: ListApplicationsQueryDto,
  ) {
    return this.listApplicationsUseCase.execute(query);
  }

  // Public: whether the portal accepts applications (ADMIN setting).
  // Declared before ':id' so "intake" is never parsed as an application id.
  @Get('intake')
  getApplicationIntake() {
    return this.getApplicationIntakeUseCase.execute();
  }

  // Signed-in user (any role): may they start an application? Each applicant
  // may apply only once; the upload and the final submission enforce it.
  // Declared before ':id' so "eligibility" is never parsed as an application id.
  @Get('eligibility')
  @UseGuards(SupabaseAuthGuard)
  getApplicantEligibility(
    @Req() request: AuthenticatedRequest,
  ) {
    const authUser = request.authUser;
    if (!authUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.getApplicantEligibilityUseCase.execute(authUser);
  }

  // HR releases a selection: frees its seat; final for this application.
  @Post(':id/release-selection')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  releaseSelection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReleaseApplicationSelectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.releaseApplicationSelectionUseCase.execute(actorProfileId, id, dto.reason);
  }

  // Declared before ':id' so "export" is never parsed as an application id.
  @Get('export')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  async exportApplications(
    @Query() query: ListApplicationsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csv = await this.exportApplicationsUseCase.execute(query);
    const date = new Date().toISOString().slice(0, 10);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="applications-${date}.csv"`);
    response.setHeader('Cache-Control', 'no-store');

    return csv;
  }

  @Post(':id/match')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  matchApplication(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.matchApplicationUseCase.execute(
      id,
    );
  }

  @Get(':id/match')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getApplicationMatch(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.getApplicationMatchUseCase.execute(
      id,
    );
  }

  // Fresh, short-lived link to the private CV, issued on demand.
  @Get(':id/cv-url')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getApplicationCvUrl(
    @Param('id', ParseUUIDPipe)
    id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.getApplicationCvUrlUseCase.execute(id);
  }

  @Get(':id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getApplicationDetails(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.getApplicationDetailsUseCase.execute(
      id,
    );
  }

  @Patch(':id/status')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  updateApplicationStatus(
    @Param('id', ParseUUIDPipe)
    id: string,

    @Body()
    dto: UpdateApplicationStatusDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const actorProfileId = request.authUser?.id;
    if (!actorProfileId) {
      throw new UnauthorizedException('Authentication required');
    }

    return this.updateApplicationStatusUseCase.execute({
      actorProfileId,
      applicationId: id,
      status: dto.status,
      reason: dto.reason ?? null,
      note: dto.note ?? null,
    });
  }

  @Post(':id/parse')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  parseCv(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.parseCvUseCase.execute(
      id,
    );
  }

  // Public: the review token authorizes the submission. An applicant whose
  // account already exists must also send their own session.
  @Post('review/:reviewToken/submit')
  submitReviewedApplication(
    @Param('reviewToken')
    reviewToken: string,

    @Body()
    dto: SubmitReviewedApplicationDto,

    @Headers('authorization')
    authorization: string | undefined,
  ) {
    return this.submitReviewedApplicationUseCase.execute(
      reviewToken,
      dto,
      parseOptionalBearerToken(authorization),
    );
  }

  // Public, read-only: was this CV (by its SHA-256, computed in the browser)
  // already submitted with an application, so it cannot be used again? Lets
  // the Apply page say so before uploading; POST /applications/submit still
  // enforces it.
  @Post('cv-check')
  @HttpCode(200)
  checkCvDuplicate(
    @Body()
    dto: CheckCvDuplicateDto,
  ) {
    return this.checkCvDuplicateUseCase.execute(
      dto.cvSha256,
      dto.internshipId ?? null,
      dto.requestedTraining ?? null,
    );
  }

  // Public: creates only a DRAFT and emails a one-time review link. A
  // signed-in caller's session is also checked against the one-application
  // rule.
  @Post('submit')
  @UseInterceptors(
    FileInterceptor('cv', {
      // Stop oversized uploads while streaming instead of buffering them.
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    }),
  )
  submitApplication(
    @UploadedFile()
    file: Express.Multer.File,

    @Body()
    dto: SubmitApplicationDto,

    @Headers('authorization')
    authorization: string | undefined,
  ) {
    return this.submitApplicationUseCase.execute(
      dto.internshipId ?? null,
      dto.requestedTraining ?? null,
      file,
      parseOptionalBearerToken(authorization),
    );
  }

  // Public: the review token authorizes reading the draft's extracted data.
  @Get('review/:reviewToken')
  getApplicationReview(
    @Param('reviewToken')
    reviewToken: string,
  ) {
    return this.getApplicationReviewUseCase.execute(
      reviewToken,
    );
  }
}
