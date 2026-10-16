import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Shared validation for applicant profile data: the reviewed CV submission
// and later self-service profile edits. Unknown fields are stripped by the
// global ValidationPipe (whitelist) at every nesting level.

export class EducationEntryDto {
  @IsOptional() @IsString() @MaxLength(200) institution: string | null;
  @IsOptional() @IsString() @MaxLength(200) degree: string | null;
  @IsOptional() @IsString() @MaxLength(200) fieldOfStudy: string | null;
  @IsOptional() @IsString() @MaxLength(50) startDate: string | null;
  @IsOptional() @IsString() @MaxLength(50) endDate: string | null;
}

export class ExperienceEntryDto {
  @IsOptional() @IsString() @MaxLength(200) company: string | null;
  @IsOptional() @IsString() @MaxLength(200) position: string | null;
  @IsOptional() @IsString() @MaxLength(50) startDate: string | null;
  @IsOptional() @IsString() @MaxLength(50) endDate: string | null;
  @IsOptional() @IsString() @MaxLength(3000) description: string | null;
}

// Stored as entered; only valid http(s) URLs are ever rendered as links.
export class ProfileLinksDto {
  @IsOptional() @IsString() @MaxLength(500) linkedin: string | null;
  @IsOptional() @IsString() @MaxLength(500) github: string | null;
  @IsOptional() @IsString() @MaxLength(500) portfolio: string | null;
}

export class CvProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  summary: string | null;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EducationEntryDto)
  education: EducationEntryDto[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ExperienceEntryDto)
  experience: ExperienceEntryDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  languages: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  certifications: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => ProfileLinksDto)
  links: ProfileLinksDto;
}
