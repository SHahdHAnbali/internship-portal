import { useQuery } from '@tanstack/react-query';

import { getMyInternPlacement } from '../services/intern-placement.service';

export const MY_INTERN_PLACEMENT_KEY = ['intern', 'my-placement'] as const;

export function useMyInternPlacement() {
  return useQuery({
    queryKey: MY_INTERN_PLACEMENT_KEY,
    queryFn: getMyInternPlacement,
    retry: false,
  });
}
