import { QueryClient } from '@tanstack/react-query';

// The app's single query cache. AuthProvider clears it whenever the signed-in
// user changes or signs out, so one user's server data is never shown to
// another user in the same tab.
// A private query key scoped to the signed-in user, in addition to the cache
// being cleared when the user changes. The user id is appended, so existing
// prefix invalidations (e.g. ['mentor', 'placements']) still match.
export function userScopedKey<const K extends readonly unknown[]>(key: K, userId: string | null | undefined) {
  return [...key, userId ?? ''] as const;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});
