import { ConflictException } from '@nestjs/common';

// A CV file (by its SHA-256) that is already part of a submitted application
// (any status other than DRAFT, any training, any applicant) can never be
// used for another application. Separate from the one-application-per-
// applicant rule (PREVIOUS_APPLICATION_EXISTS) and checked before it. The
// message names no application, training or person.
export const CV_ALREADY_SUBMITTED = 'CV_ALREADY_SUBMITTED';

export const CV_ALREADY_SUBMITTED_MESSAGE =
  'This CV has already been submitted with an application, so it cannot be used for another application. Please upload a different CV.';

export function cvAlreadySubmitted(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: CV_ALREADY_SUBMITTED,
    message: CV_ALREADY_SUBMITTED_MESSAGE,
  });
}
