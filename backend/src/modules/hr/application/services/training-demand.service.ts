import { Injectable } from '@nestjs/common';

import { TrainingPlanningService } from '../../../internships/application/services/training-planning.service.js';

import type {
  TrainingDemandItem,
  TrainingDemandResponse,
} from './training-demand.types.js';

// Dashboard summary of submitted demand per training, derived from the same
// planning computation as the Training Planning page (mapped "Other"
// requests count toward their opportunity).
@Injectable()
export class TrainingDemandService {
  constructor(
    private readonly planning: TrainingPlanningService,
  ) {}

  async getDemand(): Promise<TrainingDemandResponse> {
    const plan = await this.planning.getPlan();

    const items: TrainingDemandItem[] = [
      ...plan.opportunities
        .filter((opportunity) => opportunity.demand.total > 0)
        .map((opportunity) => ({
          name: opportunity.title,
          type: 'INTERNSHIP' as const,
          count: opportunity.demand.total,
        })),
      ...plan.unmatchedRequests.map((request) => ({
        name: request.label,
        type: 'OTHER' as const,
        count: request.demand.total,
      })),
    ].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      totalRequests: plan.totals.total,
      items,
    };
  }
}
