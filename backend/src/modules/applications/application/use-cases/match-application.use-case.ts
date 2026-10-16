import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { AiApplicationMatcherService } from '../../infrastructure/ai/ai-application-matcher.service.js';
import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';
import { loadSubmittedApplication } from './submitted-application.js';
import { toApplicationMatchResponse, type ApplicationMatchRow } from './get-application-match.use-case.js';

interface MatchSourceRow {
  id: string;
  status: string;
  internship_id: string | null;
  extracted_data: ExtractedCvData | null;
}

// Advisory comparison of the applicant's reviewed data with the internship's
// requirements. It never changes the application's status or ordering.
@Injectable()
export class MatchApplicationUseCase {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly aiMatcher: AiApplicationMatcherService,
  ) {}

  async execute(applicationId: string) {
    const supabase = this.supabaseService.client;

    const application = await loadSubmittedApplication<MatchSourceRow>(
      this.supabaseService,
      applicationId,
      'id, status, internship_id, extracted_data',
    );

    if (!application.internship_id) {
      throw new UnprocessableEntityException(
        'Matching is only available for applications to a listed internship.',
      );
    }

    if (!application.extracted_data) {
      throw new UnprocessableEntityException(
        'This application has no reviewed applicant data to compare.',
      );
    }

    const { data: requirements, error: requirementsError } = await supabase
      .from('internship_requirements')
      .select('*')
      .eq('internship_id', application.internship_id)
      .maybeSingle();

    if (requirementsError) {
      throw new InternalServerErrorException('Unable to load the internship requirements');
    }

    if (!requirements) {
      throw new NotFoundException('Requirements have not been defined for this internship yet.');
    }

    const match = await this.aiMatcher.match(
      {
        requiredSkills: requirements.required_skills ?? [],
        preferredSkills: requirements.preferred_skills ?? [],
        minimumEducation: requirements.minimum_education ?? null,
        minimumExperienceYears:
          requirements.minimum_experience_years === null
            ? null
            : Number(requirements.minimum_experience_years),
        languages: requirements.languages ?? [],
        certifications: requirements.certifications ?? [],
        otherRequirements: requirements.other_requirements ?? null,
      },
      application.extracted_data,
    );

    const { data: savedMatch, error: saveError } = await supabase
      .from('application_matches')
      .upsert(
        {
          application_id: applicationId,
          overall_score: match.overallScore,
          skills_score: match.skillsScore,
          education_score: match.educationScore,
          experience_score: match.experienceScore,
          languages_score: match.languagesScore,
          matched_requirements: match.matchedRequirements,
          missing_requirements: match.missingRequirements,
          strengths: match.strengths,
          gaps: match.gaps,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'application_id' },
      )
      .select('*')
      .single();

    if (saveError || !savedMatch) {
      throw new InternalServerErrorException('Unable to save the matching result');
    }

    return toApplicationMatchResponse(savedMatch as ApplicationMatchRow);
  }
}
