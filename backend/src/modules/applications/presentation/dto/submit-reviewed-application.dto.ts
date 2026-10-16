import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';
import { CvProfileDto } from './cv-profile.dto.js';

// The applicant's reviewed and corrected CV data. The email must equal the
// address the review link was sent to (checked in the use case and database).
export class SubmitReviewedApplicationDto
  extends CvProfileDto
  implements ExtractedCvData
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location: string | null;
}
