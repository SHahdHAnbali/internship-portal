import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    Min,
  } from 'class-validator';
  
  export class UpsertInternshipRequirementsDto {
    @IsArray()
    @IsString({ each: true })
    requiredSkills: string[];
  
    @IsArray()
    @IsString({ each: true })
    preferredSkills: string[];
  
    @IsOptional()
    @IsString()
    minimumEducation: string | null;
  
    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumExperienceYears: number | null;
  
    @IsArray()
    @IsString({ each: true })
    languages: string[];
  
    @IsArray()
    @IsString({ each: true })
    certifications: string[];
  
    @IsOptional()
    @IsString()
    otherRequirements: string | null;
  }