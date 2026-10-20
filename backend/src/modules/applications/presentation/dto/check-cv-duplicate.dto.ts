import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// Same training fields as SubmitApplicationDto, plus the SHA-256 (hex) of the
// CV file the applicant selected.
export class CheckCvDuplicateDto {
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  cvSha256: string;

  @IsOptional()
  @IsUUID()
  internshipId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  requestedTraining?: string;
}
