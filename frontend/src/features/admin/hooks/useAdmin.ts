import { useQuery } from '@tanstack/react-query';

import {
  getAdminOverview,
  listAdminAuditEvents,
  listAdminUsers,
} from '../services/admin.service';
import type { AdminUserFilters } from '../types';

export const adminKey = ['admin'] as const;

export function useAdminOverview() {
  return useQuery({ queryKey: [...adminKey, 'overview'], queryFn: getAdminOverview, retry: false });
}

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: [...adminKey, 'users', filters],
    queryFn: () => listAdminUsers(filters),
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export function useAdminAuditEvents(limit = 50) {
  return useQuery({
    queryKey: [...adminKey, 'audit-events', limit],
    queryFn: () => listAdminAuditEvents(limit),
    retry: false,
  });
}
