import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';

// Portal-wide application intake, owned by ADMIN (portal_settings). When it is
// closed no new application may be uploaded and no pending review may be
// finalized. The database enforces the same rule (insert trigger and the
// review-submission function); these checks only refuse early, before any
// parsing, storage, email or account creation.
export const APPLICATIONS_CLOSED = 'APPLICATIONS_CLOSED';

export const APPLICATIONS_CLOSED_MESSAGES = {
  newApplication:
    'Applications are currently closed. Please check back when the next intake opens.',
  review:
    'Applications are currently closed, so this application cannot be completed right now. The information you submitted has been kept.',
} as const;

export type IntakeContext = keyof typeof APPLICATIONS_CLOSED_MESSAGES;

export function applicationsClosed(context: IntakeContext): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: APPLICATIONS_CLOSED,
    message: APPLICATIONS_CLOSED_MESSAGES[context],
  });
}

export async function isApplicationIntakeOpen(supabase: SupabaseService): Promise<boolean> {
  const { data, error } = await supabase.client.rpc('get_application_intake');
  if (error || typeof data !== 'boolean') {
    // Fail closed: without a reliable answer nothing is accepted.
    throw new ServiceUnavailableException('Applications cannot be accepted right now. Please try again later.');
  }
  return data;
}

export async function assertApplicationIntakeOpen(
  supabase: SupabaseService,
  context: IntakeContext,
): Promise<void> {
  if (!(await isApplicationIntakeOpen(supabase))) {
    throw applicationsClosed(context);
  }
}

// The database refused because intake closed meanwhile.
export function isApplicationsClosedError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.message === 'applications_closed';
}
