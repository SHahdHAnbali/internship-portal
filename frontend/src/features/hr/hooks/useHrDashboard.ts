import { useEffect, useState } from 'react';

import { getHrDashboard } from '../services/dashboard.service';
import type { HrDashboardData } from '../types';

export function useHrDashboard() {
  const [data, setData] =
    useState<HrDashboardData | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setError(null);

        const dashboard =
          await getHrDashboard();

        if (!cancelled) {
          setData(dashboard);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error
              : new Error(
                  'Failed to load dashboard',
                ),
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    data,
    isLoading,
    error,
  };
}