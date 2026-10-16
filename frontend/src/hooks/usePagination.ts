import { useCallback, useState } from 'react';

interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
}

export function usePagination({ initialPage = 1, initialLimit = 10 }: UsePaginationOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const next = useCallback(() => setPage((p) => p + 1), []);
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const reset = useCallback(() => setPage(1), []);

  return { page, limit, setPage, setLimit, next, prev, reset };
}