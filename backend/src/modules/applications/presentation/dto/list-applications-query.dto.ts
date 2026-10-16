import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { ApplicationStatus } from '../../domain/enums/application-status.enum.js';
import {
  APPLICATION_SORT_FIELDS,
  type ApplicationSortField,
  type SortOrder,
} from '../../domain/types/application-list-query.js';

// HR never sees drafts, so DRAFT is not a valid filter.
export const SUBMITTED_STATUSES = [
  ApplicationStatus.NEW,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.SELECTED,
  ApplicationStatus.REJECTED,
] as const;

const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

export class ListApplicationsQueryDto {
  @Transform(trimToUndefined)
  @IsOptional()
  @IsIn(SUBMITTED_STATUSES)
  status?: ApplicationStatus;

  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @Transform(trimToUndefined)
  @IsOptional()
  @IsIn(APPLICATION_SORT_FIELDS)
  sort?: ApplicationSortField;

  @Transform(trimToUndefined)
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;
}
