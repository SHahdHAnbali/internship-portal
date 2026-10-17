import { ForbiddenException, SetMetadata } from '@nestjs/common';

// Response code for a verified, active user who has not set a password yet.
// The frontend sends them to /set-password when it sees this code.
export const PASSWORD_SETUP_REQUIRED = 'PASSWORD_SETUP_REQUIRED';

export const ALLOW_PENDING_PASSWORD_SETUP_KEY = 'allowPendingPasswordSetup';

// Marks the few routes a signed-in person must reach to finish password
// setup. It only lifts the setup requirement: authentication, the inactive
// check and role checks still apply, and the identity is still the verified
// session's.
export const AllowPendingPasswordSetup = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_SETUP_KEY, true);

export function passwordSetupRequired(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: PASSWORD_SETUP_REQUIRED,
    message: 'Set a password before using the portal.',
  });
}
