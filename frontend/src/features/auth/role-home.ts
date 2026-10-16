import type { UserRole } from './auth-context';

// Where each role lands after signing in, and where a signed-in user is sent
// when they open a page that belongs to another role.
export const ROLE_HOME: Record<UserRole, string> = {
  HR: '/hr/dashboard',
  APPLICANT: '/applicant/profile',
  INTERN: '/intern',
  MENTOR: '/mentor',
  ADMIN: '/admin/dashboard',
};
