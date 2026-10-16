import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetApplicationIntakeDto {
  @IsBoolean()
  applicationsOpen!: boolean;

  @Transform(({ value }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
