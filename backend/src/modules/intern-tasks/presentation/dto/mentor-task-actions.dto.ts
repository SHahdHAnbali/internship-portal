import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import type { TaskReviewDecision } from '../../domain/repositories/intern-task.repository.js';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class CancelInternTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ReviewInternTaskDto {
  @IsIn(['ACCEPT', 'REQUEST_CHANGES'])
  decision!: TaskReviewDecision;

  // Required by the database when requesting changes.
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string | null;
}
