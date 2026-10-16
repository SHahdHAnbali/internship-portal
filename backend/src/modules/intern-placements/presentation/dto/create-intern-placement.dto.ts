import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateInternPlacementDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'company must not be blank' })
  company!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string | null;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
}
