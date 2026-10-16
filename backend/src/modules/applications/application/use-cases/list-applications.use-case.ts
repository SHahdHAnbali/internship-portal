import { Injectable } from '@nestjs/common';

import { ApplicationRepository } from '../../domain/repositories/application.repository.js';
import type { Application } from '../../domain/entities/application.entity.js';
import {
  queryApplications,
  type ApplicationListQuery,
} from '../../domain/types/application-list-query.js';
import { toApplicationsCsv } from '../../domain/types/applications-csv.js';

export type ApplicationListFilters = Partial<ApplicationListQuery>;

export function withListDefaults(filters: ApplicationListFilters): ApplicationListQuery {
  return {
    status: filters.status,
    search: filters.search,
    sort: filters.sort ?? 'submittedAt',
    order: filters.order ?? 'desc',
  };
}

@Injectable()
export class ListApplicationsUseCase {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
  ) {}

  async execute(filters: ApplicationListFilters = {}): Promise<Application[]> {
    return queryApplications(
      await this.applicationRepository.findAll(),
      withListDefaults(filters),
    );
  }
}

// Exports exactly the rows the HR list shows for the same filters.
@Injectable()
export class ExportApplicationsUseCase {
  constructor(
    private readonly listApplications: ListApplicationsUseCase,
  ) {}

  async execute(filters: ApplicationListFilters = {}): Promise<string> {
    return toApplicationsCsv(await this.listApplications.execute(filters));
  }
}
