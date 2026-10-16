import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import type { UserRole } from '../../../../infrastructure/auth/user-role.type.js';

export const ALL_ROLES: UserRole[] = ['APPLICANT', 'INTERN', 'MENTOR', 'HR', 'ADMIN'];
// Roles an administrator may create or switch between. Applicant and Intern
// roles come from the application and placement workflow.
export const STAFF_ROLES = ['HR', 'MENTOR', 'ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class ListAdminUsersQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ALL_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class CreateStaffUserDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @IsIn(STAFF_ROLES)
  role: StaffRole;
}

export class ChangeUserRoleDto {
  @IsIn(STAFF_ROLES)
  role: StaffRole;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SetUserStatusDto {
  @IsBoolean()
  active: boolean;

  // Required by the database when deactivating.
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ListAuditEventsQueryDto {
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
