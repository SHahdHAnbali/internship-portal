import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getApplications } from '../services/applications.service';
import type { ApplicationListParams } from '../types';

import { hrApplicationsKey } from './query-keys';

// HR application list. Filtering and sorting happen on the server, using the
// same rules as the CSV export, so both always agree.
export function useApplications(params: ApplicationListParams) {
  return useQuery({
    queryKey: [...hrApplicationsKey, params],
    queryFn: () => getApplications(params),
    placeholderData: keepPreviousData,
  });
}
