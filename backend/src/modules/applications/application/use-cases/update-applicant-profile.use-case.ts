import { Injectable } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { throwSupabaseRpcHttpException } from '../../../../infrastructure/database/supabase-rpc-error.js';
import type { UpdateApplicantProfileDto } from '../../presentation/dto/update-applicant-profile.dto.js';
import { GetApplicantProfileUseCase } from './get-applicant-profile.use-case.js';

// Self-service edit of the signed-in applicant's descriptive profile fields.
// The database function re-checks the role and owner, refuses unknown fields
// and never touches email, role, applications or decisions.
@Injectable()
export class UpdateApplicantProfileUseCase {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly getProfile: GetApplicantProfileUseCase,
  ) {}

  async execute(authUserId: string, dto: UpdateApplicantProfileDto) {
    const { error } = await this.supabase.client.rpc('update_my_applicant_profile', {
      p_auth_user_id: authUserId,
      p_full_name: dto.fullName,
      p_phone: dto.phone ?? null,
      p_location: dto.location ?? null,
      p_profile_data: {
        summary: dto.summary ?? null,
        education: dto.education,
        experience: dto.experience,
        skills: dto.skills,
        languages: dto.languages,
        certifications: dto.certifications,
        links: {
          linkedin: dto.links?.linkedin ?? null,
          github: dto.links?.github ?? null,
          portfolio: dto.links?.portfolio ?? null,
        },
      },
    });

    if (error) {
      throwSupabaseRpcHttpException(error);
    }

    return this.getProfile.execute(authUserId);
  }
}
