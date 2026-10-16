import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

import type {
  AdminAuditEvent,
  ApplicationIntakeSetting,
  AdminOverview,
  AdminUser,
  AdminUserFilters,
  CreateStaffUserInput,
  StaffRole,
} from '../types';

// Admin API. The backend re-checks the ADMIN role and every rule (own account,
// last admin, Mentor placements); these calls only carry the request.
async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await authenticatedFetch(`${env.apiUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, fallback));
  }
  return (await response.json()) as T;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function getAdminOverview() {
  return request<AdminOverview>('/admin/overview', {}, 'Unable to load the overview.');
}

export function listAdminUsers(filters: AdminUserFilters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return request<{ users: AdminUser[]; total: number }>(
    `/admin/users${query ? `?${query}` : ''}`, {}, 'Unable to load users.',
  );
}

export function createStaffUser(input: CreateStaffUserInput) {
  return request<AdminUser>('/admin/users', jsonBody('POST', input), 'Unable to create the account.');
}

export function changeUserRole(userId: string, role: StaffRole, note: string | null) {
  return request<AdminUser>(`/admin/users/${userId}/role`, jsonBody('PATCH', { role, note }), 'Unable to change the role.');
}

export function setUserActive(userId: string, active: boolean, note: string | null) {
  return request<{ user: AdminUser; signInBlockSynced: boolean }>(
    `/admin/users/${userId}/status`, jsonBody('PATCH', { active, note }), 'Unable to change the account status.',
  );
}

export function listAdminAuditEvents(limit = 50) {
  return request<AdminAuditEvent[]>(`/admin/audit-events?limit=${limit}`, {}, 'Unable to load the audit trail.');
}

// Portal-wide application intake (ADMIN only).
export function getApplicationIntakeSetting() {
  return request<ApplicationIntakeSetting>('/admin/settings/application-intake', {}, 'Unable to load the intake setting.');
}

export function setApplicationIntake(applicationsOpen: boolean, note: string | null) {
  return request<ApplicationIntakeSetting>(
    '/admin/settings/application-intake', jsonBody('PATCH', { applicationsOpen, note }), 'Unable to change application intake.',
  );
}
