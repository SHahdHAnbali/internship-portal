import { Module } from '@nestjs/common';

import { AuthModule } from '../../infrastructure/auth/auth.module.js';

import { InternshipsModule } from '../internships/internships.module.js';

import { HrDashboardService } from './application/services/hr-dashboard.service.js';

import { TrainingDemandService } from './application/services/training-demand.service.js';

import { GetHrDashboardUseCase } from './application/use-cases/get-hr-dashboard.use-case.js';

import { HrDashboardController } from './presentation/controllers/hr-dashboard.controller.js';

@Module({
  imports: [AuthModule, InternshipsModule],

  controllers: [
    HrDashboardController,
  ],

  providers: [
    HrDashboardService,
    TrainingDemandService,
    GetHrDashboardUseCase,
  ],
})
export class HrModule {}
