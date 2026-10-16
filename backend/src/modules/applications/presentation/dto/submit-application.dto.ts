import {
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
  } from 'class-validator';
  
  export class SubmitApplicationDto {
    @IsOptional()
    @IsUUID()
    internshipId?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(150)
    requestedTraining?: string;
  }