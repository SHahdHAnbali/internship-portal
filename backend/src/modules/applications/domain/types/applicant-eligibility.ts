import { ConflictException } from '@nestjs/common';

// Each applicant may submit only one application, ever: any earlier
// application that left DRAFT (whatever its status, training or CV) makes the
// applicant ineligible. The message names no application, training or person.
export const PREVIOUS_APPLICATION_EXISTS = 'PREVIOUS_APPLICATION_EXISTS';

export const PREVIOUS_APPLICATION_MESSAGE =
  'You have already submitted an application. Each applicant can apply only once, so another application cannot be submitted. Sign in to follow your existing application.';

export function previousApplicationExists(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: PREVIOUS_APPLICATION_EXISTS,
    message: PREVIOUS_APPLICATION_MESSAGE,
  });
}
