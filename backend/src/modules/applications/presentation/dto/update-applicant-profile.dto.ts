import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { CvProfileDto } from './cv-profile.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Self-service edits of descriptive profile fields only. Email, role,
// applications, decisions and submitted application snapshots are not editable.
export class UpdateApplicantProfileDto extends CvProfileDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location: string | null;
}
