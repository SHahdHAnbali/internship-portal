import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteInternPlacementDto {
  // Required by the database when ending before the planned end date.
  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
