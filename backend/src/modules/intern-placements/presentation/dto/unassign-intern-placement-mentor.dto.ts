import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UnassignInternPlacementMentorDto {
  // Optional reason, kept in the placement history.
  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
