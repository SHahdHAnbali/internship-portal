import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { WeeklyReportDecision } from '../../domain/repositories/weekly-report.repository.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

// Draft content; every field is optional until submission (summary required then).
export class SaveWeeklyReportDto {
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  learnings?: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  challenges?: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  nextWeekPlan?: string | null;
}

export class ReviewWeeklyReportDto {
  @IsIn(['ACCEPT', 'RETURN'])
  decision!: WeeklyReportDecision;

  // Required by the database when returning a report.
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string | null;
}
