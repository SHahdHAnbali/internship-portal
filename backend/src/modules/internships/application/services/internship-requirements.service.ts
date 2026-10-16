import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
  } from '@nestjs/common';
  
  import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
  
  import type { InternshipRequirements } from '../../domain/types/internship-requirements.js';
  
  @Injectable()
  export class InternshipRequirementsService {
    constructor(
      private readonly supabaseService: SupabaseService,
    ) {}
  
    async getByInternshipId(
      internshipId: string,
    ): Promise<InternshipRequirements | null> {
      const { data, error } =
        await this.supabaseService.client
          .from('internship_requirements')
          .select('*')
          .eq('internship_id', internshipId)
          .maybeSingle();
  
      if (error) {
        throw new InternalServerErrorException(
          'Unable to load the internship requirements',
        );
      }
  
      if (!data) {
        return null;
      }
  
      return this.mapRow(data);
    }
  
    async upsert(
      internshipId: string,
      input: {
        requiredSkills: string[];
        preferredSkills: string[];
        minimumEducation: string | null;
        minimumExperienceYears: number | null;
        languages: string[];
        certifications: string[];
        otherRequirements: string | null;
      },
    ): Promise<InternshipRequirements> {
      const {
        data: internship,
        error: internshipError,
      } =
        await this.supabaseService.client
          .from('internships')
          .select('id')
          .eq('id', internshipId)
          .maybeSingle();
  
      if (internshipError) {
        throw new InternalServerErrorException(
          'Unable to load the internship',
        );
      }
  
      if (!internship) {
        throw new NotFoundException(
          'Internship not found',
        );
      }
  
      const { data, error } =
        await this.supabaseService.client
          .from('internship_requirements')
          .upsert(
            {
              internship_id: internshipId,
  
              required_skills:
                input.requiredSkills,
  
              preferred_skills:
                input.preferredSkills,
  
              minimum_education:
                input.minimumEducation,
  
              minimum_experience_years:
                input.minimumExperienceYears,
  
              languages:
                input.languages,
  
              certifications:
                input.certifications,
  
              other_requirements:
                input.otherRequirements,
  
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                'internship_id',
            },
          )
          .select('*')
          .single();
  
      if (error) {
        throw new InternalServerErrorException(
          'Unable to save the internship requirements',
        );
      }
  
      return this.mapRow(data);
    }
  
    private mapRow(
      row: any,
    ): InternshipRequirements {
      return {
        id: row.id,
        internshipId:
          row.internship_id,
  
        requiredSkills:
          row.required_skills ?? [],
  
        preferredSkills:
          row.preferred_skills ?? [],
  
        minimumEducation:
          row.minimum_education ?? null,
  
        minimumExperienceYears:
          row.minimum_experience_years === null
            ? null
            : Number(
                row.minimum_experience_years,
              ),
  
        languages:
          row.languages ?? [],
  
        certifications:
          row.certifications ?? [],
  
        otherRequirements:
          row.other_requirements ?? null,
  
        createdAt:
          row.created_at,
  
        updatedAt:
          row.updated_at,
      };
    }
  }