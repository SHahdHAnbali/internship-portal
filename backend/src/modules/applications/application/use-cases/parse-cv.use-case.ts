import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
  } from '@nestjs/common';
  
  import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
  
  import { CvTextExtractorService } from '../../infrastructure/parsing/cv-text-extractor.service.js';

  import { loadSubmittedApplication } from './submitted-application.js';

  @Injectable()
  export class ParseCvUseCase {
    constructor(
      private readonly supabase:
        SupabaseService,
  
      private readonly cvTextExtractor:
        CvTextExtractorService,
    ) {}
  
    async execute(
      applicationId: string,
    ) {
      const application =
        await loadSubmittedApplication<{ id: string; status: string; cv_path: string | null }>(
          this.supabase,
          applicationId,
          'id, cv_path, status',
        );

      if (!application.cv_path) {
        throw new NotFoundException(
          'CV file not found for this application',
        );
      }

      const { data: file, error: downloadError } =
        await this.supabase.client.storage
          .from('cvs')
          .download(application.cv_path);

      if (downloadError || !file) {
        throw new InternalServerErrorException(
          'Unable to read the CV right now',
        );
      }
  
      const arrayBuffer =
        await file.arrayBuffer();
  
      const buffer =
        Buffer.from(arrayBuffer);
  
      const mimeType =
        file.type ||
        this.detectMimeType(
          application.cv_path,
        );
  
      const text =
        await this.cvTextExtractor.extractText(
          buffer,
          mimeType,
        );
  
      return {
        applicationId:
          application.id,
  
        textLength:
          text.length,
  
        text,
      };
    }
  
    private detectMimeType(
      path: string,
    ): string {
      const extension =
        path
          .split('.')
          .pop()
          ?.toLowerCase();
  
      if (extension === 'pdf') {
        return 'application/pdf';
      }
  
      if (extension === 'docx') {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
  
      return 'application/octet-stream';
    }
  }