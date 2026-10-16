import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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

import { AdminOverviewService } from '../../application/services/admin-overview.service.js';
import { AdminUsersService } from '../../application/services/admin-users.service.js';
import { AdminSettingsService } from '../../application/services/admin-settings.service.js';
import { SetApplicationIntakeDto } from '../dto/admin-settings.dto.js';
import {
  ChangeUserRoleDto,
  CreateStaffUserDto,
  ListAdminUsersQueryDto,
  ListAuditEventsQueryDto,
  SetUserStatusDto,
} from '../dto/admin-users.dto.js';

// System administration: accounts, roles and configuration status.
// ADMIN only; administrators do not get HR, Mentor or Intern capabilities.
@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly users: AdminUsersService,
    private readonly settings: AdminSettingsService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.overview.getOverview();
  }

  @Get('users')
  listUsers(@Query() query: ListAdminUsersQueryDto) {
    return this.users.listUsers(query);
  }

  @Post('users')
  createUser(
    @Body() dto: CreateStaffUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.createStaffUser(actorId(request), dto);
  }

  @Patch('users/:id/role')
  changeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeUserRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.changeRole(actorId(request), id, dto.role, dto.note ?? null);
  }

  @Patch('users/:id/status')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.setActive(actorId(request), id, dto.active, dto.note ?? null);
  }

  // Portal-wide application intake (ADMIN only; HR cannot change it).
  @Get('settings/application-intake')
  getApplicationIntake() {
    return this.settings.getApplicationIntake();
  }

  @Patch('settings/application-intake')
  setApplicationIntake(
    @Body() dto: SetApplicationIntakeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settings.setApplicationIntake(actorId(request), dto.applicationsOpen, dto.note ?? null);
  }

  @Get('audit-events')
  listAuditEvents(@Query() query: ListAuditEventsQueryDto) {
    return this.users.listAuditEvents(query);
  }
}

function actorId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
