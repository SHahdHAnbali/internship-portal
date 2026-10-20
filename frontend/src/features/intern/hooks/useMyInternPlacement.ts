import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-context';
import { userScopedKey } from '@/lib/query-client';

import { getMyInternPlacement } from '../services/intern-placement.service';

export const MY_INTERN_PLACEMENT_KEY = ['intern', 'my-placement'] as const;

// Scoped to the signed-in user; MY_INTERN_PLACEMENT_KEY stays the prefix.
export function useMyInternPlacement() {
  const { user } = useAuth();
  return useQuery({
    queryKey: userScopedKey(MY_INTERN_PLACEMENT_KEY, user?.id),
    queryFn: getMyInternPlacement,
    retry: false,
  });
}
