import { Injectable } from '@nestjs/common';

import { HrDashboardService } from '../services/hr-dashboard.service.js';

@Injectable()
export class GetHrDashboardUseCase {
  constructor(
    private readonly dashboardService:
      HrDashboardService,
  ) {}

  execute() {
    return this.dashboardService.getDashboard();
  }
}