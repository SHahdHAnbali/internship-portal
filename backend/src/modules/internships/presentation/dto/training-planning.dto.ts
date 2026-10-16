import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class CreateInternshipDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  // Seats for the opportunity's cycle; usually set after approval.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  capacity?: number | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  // Listed for applicants (default: listed, so demand can be gathered).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Approve now, or leave awaiting approval (default).
  @IsOptional()
  @IsIn(['NOT_APPROVED', 'OPEN'])
  selectionStatus?: 'NOT_APPROVED' | 'OPEN';
}

export class UpdateInternshipDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsBoolean()
  isActive: boolean;

  // Required key; null clears it (only while no seat is consumed).
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(10000)
  capacity: number | null;

  @IsIn(['NOT_APPROVED', 'OPEN', 'CLOSED'])
  selectionStatus: 'NOT_APPROVED' | 'OPEN' | 'CLOSED';

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class MapTrainingRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  label: string;

  @IsUUID()
  internshipId: string;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UnmapTrainingRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  label: string;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
