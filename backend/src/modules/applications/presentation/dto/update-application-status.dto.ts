import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  HR_TARGET_STATUSES,
  type HrTargetStatus,
} from '../../domain/types/application-status-rules.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class UpdateApplicationStatusDto {
  @IsIn(HR_TARGET_STATUSES)
  status: HrTargetStatus;

  // Shown to the applicant. Required when rejecting (enforced in the database).
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  // Internal HR note, never shown to the applicant.
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
