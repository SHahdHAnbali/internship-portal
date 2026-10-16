import type { Application } from '../entities/application.entity.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';

export const APPLICATION_SORT_FIELDS = ['submittedAt', 'applicantName', 'status'] as const;
export type ApplicationSortField = (typeof APPLICATION_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface ApplicationListQuery {
  status?: ApplicationStatus;
  search?: string;
  sort: ApplicationSortField;
  order: SortOrder;
}

// Pipeline order used for sorting by status.
const STATUS_ORDER: Record<ApplicationStatus, number> = {
  [ApplicationStatus.DRAFT]: 0,
  [ApplicationStatus.NEW]: 1,
  [ApplicationStatus.UNDER_REVIEW]: 2,
  [ApplicationStatus.SHORTLISTED]: 3,
  [ApplicationStatus.INTERVIEW]: 4,
  [ApplicationStatus.SELECTED]: 5,
  [ApplicationStatus.REJECTED]: 6,
};

// The single filter/sort implementation shared by the HR list and the CSV
// export, so an export always matches what HR is looking at.
export function queryApplications(
  applications: readonly Application[],
  query: ApplicationListQuery,
): Application[] {
  const search = query.search?.trim().toLowerCase() ?? '';

  const filtered = applications.filter((application) => {
    if (query.status && application.status !== query.status) {
      return false;
    }
    if (!search) {
      return true;
    }
    return [
      application.applicantName,
      application.applicantEmail,
      application.internshipTitle,
    ].some((value) => value.toLowerCase().includes(search));
  });

  const direction = query.order === 'asc' ? 1 : -1;

  return filtered
    .map((application, index) => ({ application, index }))
    .sort((left, right) => {
      const compared = compareBy(query.sort, left.application, right.application);
      // Stable, deterministic tie-break on submission time then id.
      return compared !== 0
        ? compared * direction
        : compareDates(right.application.submittedAt, left.application.submittedAt)
          || left.application.id.localeCompare(right.application.id);
    })
    .map(({ application }) => application);
}

function compareBy(field: ApplicationSortField, left: Application, right: Application): number {
  switch (field) {
    case 'applicantName':
      return left.applicantName.localeCompare(right.applicantName, undefined, { sensitivity: 'base' });
    case 'status':
      return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    case 'submittedAt':
      return compareDates(left.submittedAt, right.submittedAt);
  }
}

// Missing timestamps (legacy rows) sort as oldest.
function compareDates(left: Date | null, right: Date | null): number {
  return (left?.getTime() ?? 0) - (right?.getTime() ?? 0);
}
