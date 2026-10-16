import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInternTaskStatusDto {
  @IsIn(['IN_PROGRESS', 'COMPLETED'])
  status!: 'IN_PROGRESS' | 'COMPLETED';

  // Optional progress note shown to the Mentor in the task history.
  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
