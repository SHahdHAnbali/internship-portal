import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import { loadSubmittedApplication } from './submitted-application.js';

// Short-lived link to the private CV, issued only when HR asks for it.
export const CV_URL_LIFETIME_SECONDS = 5 * 60;

@Injectable()
export class GetApplicationCvUrlUseCase {
  constructor(
    private readonly supabase: SupabaseService,
  ) {}

  async execute(applicationId: string) {
    const application = await loadSubmittedApplication<{ status: string; cv_path: string | null }>(
      this.supabase,
      applicationId,
      'status, cv_path',
    );

    if (!application.cv_path) {
      throw new NotFoundException('No CV is stored for this application');
    }

    const { data, error } = await this.supabase.client.storage
      .from('cvs')
      .createSignedUrl(application.cv_path, CV_URL_LIFETIME_SECONDS);

    if (error || !data?.signedUrl) {
      throw new InternalServerErrorException('Unable to open the CV right now');
    }

    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + CV_URL_LIFETIME_SECONDS * 1000).toISOString(),
    };
  }
}
