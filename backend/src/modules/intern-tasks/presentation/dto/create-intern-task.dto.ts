import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import type { InternTaskPriority } from '../../domain/repositories/intern-task.repository.js';

export const TASK_PRIORITIES: InternTaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export class CreateInternTaskDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'title must not be blank' })
  title!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: InternTaskPriority;
}

// Full replacement of the editable fields (title, description, due date, priority).
export class UpdateInternTaskDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'title must not be blank' })
  title!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;

  @IsIn(TASK_PRIORITIES)
  priority!: InternTaskPriority;
}
