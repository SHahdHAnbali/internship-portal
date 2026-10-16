import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { throwSupabaseRpcHttpException } from '../../../infrastructure/database/supabase-rpc-error.js';

const MESSAGES: Record<string, () => Error> = {
  admin_role_required: () => new ForbiddenException('Only an active administrator can do this.'),
  invalid_staff_role: () => new BadRequestException('Choose HR, Mentor or Admin.'),
  invalid_email: () => new BadRequestException('Enter a valid email address.'),
  full_name_required: () => new BadRequestException('Enter a full name of at most 200 characters.'),
  note_too_long: () => new BadRequestException('The note is too long.'),
  invalid_account_status: () => new BadRequestException('Choose whether the account is active.'),
  deactivation_reason_required: () => new BadRequestException('Give a reason for deactivating the account.'),
  account_already_exists: () => new ConflictException('An account with this email already exists.'),
  auth_user_not_found: () => new NotFoundException('The sign-in account could not be found.'),
  user_not_found: () => new NotFoundException('User not found'),
  cannot_change_own_account: () => new ConflictException('You cannot change the role or status of your own account.'),
  role_not_staff: () => new ConflictException('Applicant and intern roles are managed by the application and placement workflow.'),
  role_unchanged: () => new ConflictException('The user already has this role.'),
  intake_unchanged: () => new ConflictException('Application intake is already in that state.'),
  invalid_intake_setting: () => new BadRequestException('Choose whether applications are open.'),
  last_admin: () => new ConflictException('At least one active administrator must remain.'),
  mentor_has_open_placements: () => new ConflictException('This Mentor still supervises scheduled or active placements. HR must reassign them first.'),
};

// Maps admin database-function errors to clear HTTP errors without exposing
// database text.
export function throwAdminError(error: { code?: string; message?: string }): never {
  const build = error.message ? MESSAGES[error.message] : undefined;
  if (build) {
    throw build();
  }
  throwSupabaseRpcHttpException(error);
}
