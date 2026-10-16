import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { loadSubmittedApplication } from './submitted-application.js';

export interface ApplicationMatchRow {
  id: string;
  application_id: string;
  overall_score: number;
  skills_score: number | null;
  education_score: number | null;
  experience_score: number | null;
  languages_score: number | null;
  matched_requirements: string[] | null;
  missing_requirements: string[] | null;
  strengths: string[] | null;
  gaps: string[] | null;
  created_at: string;
  updated_at: string;
}

export function toApplicationMatchResponse(row: ApplicationMatchRow) {
  return {
    id: row.id,
    applicationId: row.application_id,
    // Advisory only: HR makes every decision.
    advisory: true as const,
    overallScore: row.overall_score,
    skillsScore: row.skills_score,
    educationScore: row.education_score,
    experienceScore: row.experience_score,
    languagesScore: row.languages_score,
    matchedRequirements: row.matched_requirements ?? [],
    missingRequirements: row.missing_requirements ?? [],
    strengths: row.strengths ?? [],
    gaps: row.gaps ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class GetApplicationMatchUseCase {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  async execute(applicationId: string) {
    await loadSubmittedApplication<{ status: string }>(
      this.supabaseService,
      applicationId,
      'status',
    );

    const { data, error } = await this.supabaseService.client
      .from('application_matches')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load the matching result');
    }

    return data ? toApplicationMatchResponse(data as ApplicationMatchRow) : null;
  }
}
