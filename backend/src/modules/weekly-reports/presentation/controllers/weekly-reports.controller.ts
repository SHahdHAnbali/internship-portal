import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../../../infrastructure/auth/roles.decorator.js';
import { RolesGuard } from '../../../../infrastructure/auth/roles.guard.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';
import { WeeklyReportRepository } from '../../domain/repositories/weekly-report.repository.js';
import { ReviewWeeklyReportDto, SaveWeeklyReportDto } from '../dto/weekly-report.dto.js';

// Weekly training reports: the intern writes their own; the assigned Mentor
// reviews submitted ones. The database re-checks role, ownership, assignment
// and report state.
@Controller('intern/me/weekly-reports')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('INTERN')
export class InternWeeklyReportsController {
  constructor(private readonly reports: WeeklyReportRepository) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.reports.listForIntern(userId(request));
  }

  @Put(':weekStart')
  save(
    @Param('weekStart') weekStart: string,
    @Body() dto: SaveWeeklyReportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!isDateOnly(weekStart)) {
      throw new BadRequestException('The week must be a calendar date (YYYY-MM-DD).');
    }
    return this.reports.saveForIntern(userId(request), weekStart, {
      summary: dto.summary ?? null,
      learnings: dto.learnings ?? null,
      challenges: dto.challenges ?? null,
      nextWeekPlan: dto.nextWeekPlan ?? null,
    });
  }

  @Post(':reportId/submit')
  submit(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.submitForIntern(userId(request), reportId);
  }
}

@Controller('mentor')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('MENTOR')
export class MentorWeeklyReportsController {
  constructor(private readonly reports: WeeklyReportRepository) {}

  @Get('placements/:placementId/weekly-reports')
  list(
    @Param('placementId', ParseUUIDPipe) placementId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.listForMentorPlacement(userId(request), placementId);
  }

  @Post('weekly-reports/:reportId/review')
  review(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ReviewWeeklyReportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.reviewForMentor(userId(request), reportId, dto.decision, dto.feedback ?? null);
  }
}

function userId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) throw new UnauthorizedException('Authentication required');
  return id;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
