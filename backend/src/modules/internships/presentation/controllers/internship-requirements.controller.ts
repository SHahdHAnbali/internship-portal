import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Put,
    UseGuards,
  } from '@nestjs/common';

  import { SupabaseAuthGuard } from '../../../../infrastructure/auth/supabase-auth.guard.js';
  import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
  import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
  
  import { InternshipRequirementsService } from '../../application/services/internship-requirements.service.js';
  
  import { UpsertInternshipRequirementsDto } from '../dto/upsert-internship-requirements.dto.js';
  
  @Controller('internships')
  export class InternshipRequirementsController {
    constructor(
      private readonly requirementsService:
        InternshipRequirementsService,
    ) {}
  
    @Get(':id/requirements')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles('HR')
    getRequirements(
      @Param('id', ParseUUIDPipe)
      internshipId: string,
    ) {
      return this.requirementsService.getByInternshipId(
        internshipId,
      );
    }
  
    @Put(':id/requirements')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles('HR')
    upsertRequirements(
      @Param('id', ParseUUIDPipe)
      internshipId: string,
  
      @Body()
      dto: UpsertInternshipRequirementsDto,
    ) {
      return this.requirementsService.upsert(
        internshipId,
        dto,
      );
    }
  }
