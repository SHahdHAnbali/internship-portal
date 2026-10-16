import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
  } from '@nestjs/common';
  
  import { randomUUID } from 'node:crypto';
  
  import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
  
  @Injectable()
  export class CvStorageService {
    constructor(
      private readonly supabase: SupabaseService,
    ) {}
  
    async upload(
      file: Express.Multer.File,
    ): Promise<string> {
      this.assertValidFile(file);
  
      const extension =
        file.originalname
          .split('.')
          .pop()
          ?.toLowerCase() ?? 'pdf';
  
      const filePath =
        `${randomUUID()}.${extension}`;
  
      const { error } =
        await this.supabase.client.storage
          .from('cvs')
          .upload(
            filePath,
            file.buffer,
            {
              contentType: file.mimetype,
              upsert: false,
            },
          );
  
      if (error) {
        throw new InternalServerErrorException(
          'Unable to store your CV',
        );
      }

      return filePath;
    }

    // Best-effort removal of a file uploaded by the current request.
    async remove(
      filePath: string,
    ): Promise<boolean> {
      const { error } =
        await this.supabase.client.storage
          .from('cvs')
          .remove([filePath]);

      return !error;
    }

    assertValidFile(
      file: Express.Multer.File | undefined,
    ): asserts file is Express.Multer.File {
      if (!file?.buffer) {
        throw new BadRequestException(
          'Please upload your CV',
        );
      }

      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
  
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Only PDF and DOCX CV files are allowed',
        );
      }
  
      const maxSize = 5 * 1024 * 1024;
  
      if (file.size > maxSize) {
        throw new BadRequestException(
          'CV file must be 5MB or smaller',
        );
      }
    }
  }