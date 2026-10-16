import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';

import { CreateInternshipUseCase } from '../../application/use-cases/create-internship.use-case.js';
import { ListInternshipsUseCase } from '../../application/use-cases/list-internships.use-case.js';
import { UpdateInternshipUseCase } from '../../application/use-cases/update-internship.use-case.js';
import {
  CreateInternshipDto,
  UpdateInternshipDto,
} from '../dto/training-planning.dto.js';

@Controller('internships')
export class InternshipsController {
  constructor(
    private readonly listInternshipsUseCase: ListInternshipsUseCase,
    private readonly createInternshipUseCase: CreateInternshipUseCase,
    private readonly updateInternshipUseCase: UpdateInternshipUseCase,
  ) {}

  // Public: training types listed for applicants (Apply and Internships pages).
  // Approval and capacity are HR-only and never returned here.
  @Get()
  getInternships() {
    return this.listInternshipsUseCase.execute();
  }

  // HR: every training type with listing, approval and capacity.
  @Get('manage')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  getManagedInternships() {
    return this.listInternshipsUseCase.executeForHr();
  }

  @Post()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  createInternship(
    @Body() dto: CreateInternshipDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.createInternshipUseCase.execute({
      actorProfileId: actorId(request),
      title: dto.title,
      capacity: dto.capacity ?? null,
      note: dto.note ?? null,
      isActive: dto.isActive ?? true,
      selectionStatus: dto.selectionStatus ?? 'NOT_APPROVED',
    });
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('HR')
  updateInternship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInternshipDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.updateInternshipUseCase.execute({
      actorProfileId: actorId(request),
      internshipId: id,
      title: dto.title,
      isActive: dto.isActive,
      capacity: dto.capacity,
      note: dto.note ?? null,
      selectionStatus: dto.selectionStatus,
    });
  }
}

function actorId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
