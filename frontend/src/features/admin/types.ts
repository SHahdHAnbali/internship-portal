import type { UserRole } from '@/features/auth/auth-context';

export type StaffRole = 'HR' | 'MENTOR' | 'ADMIN';

export const STAFF_ROLES: StaffRole[] = ['HR', 'MENTOR', 'ADMIN'];

export const ROLE_LABELS: Record<UserRole, string> = {
  APPLICANT: 'Applicant',
  INTERN: 'Intern',
  MENTOR: 'Mentor',
  HR: 'HR',
  ADMIN: 'Admin',
};

export interface AdminUser {
  id: string;
  fullName: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AdminUserFilters {
  search: string;
  role: UserRole | '';
  status: 'active' | 'inactive' | '';
}

export type AdminAuditEventType =
  | 'ADMIN_BOOTSTRAPPED'
  | 'USER_CREATED'
  | 'ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'SETTING_UPDATED';

export interface AdminAuditEvent {
  id: string;
  type: AdminAuditEventType;
  actorName: string | null;
  actorEmail: string | null;
  targetProfileId: string | null;
  // Null for portal setting changes.
  targetEmail: string | null;
  details: Record<string, unknown>;
  note: string | null;
  createdAt: string;
}

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: Record<UserRole, { active: number; inactive: number }>;
  };
  system: {
    environment: string;
    frontendUrl: string;
    databaseConfigured: boolean;
    emailDeliveryConfigured: boolean;
    emailSenderConfigured: boolean;
    reviewEmailRedirectActive: boolean;
    cvExtractionConfigured: boolean;
  };
}

export interface ApplicationIntakeSetting {
  applicationsOpen: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CreateStaffUserInput {
  email: string;
  fullName: string;
  role: StaffRole;
}
