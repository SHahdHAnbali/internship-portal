

import { GetHrDashboardUseCase } from '../../application/use-cases/get-hr-dashboard.use-case.js';

import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import {
  SupabaseAuthGuard,
} from '../../../../infrastructure/auth/supabase-auth.guard.js';

import {
  RolesGuard,
} from '../../../../infrastructure/auth/roles.guard.js';

import {
  Roles,
} from '../../../../infrastructure/auth/roles.decorator.js';

@UseGuards(
  SupabaseAuthGuard,
  RolesGuard,
)
@Roles('HR')


@Controller('hr/dashboard')
export class HrDashboardController {
  constructor(
    private readonly getHrDashboardUseCase:
      GetHrDashboardUseCase,
  ) {}

  @Get()
  getDashboard() {
    return this.getHrDashboardUseCase.execute();
  }
}