import { BadRequestException } from '@nestjs/common';

// What an application asks for: a listed internship, or a custom "Other"
// training area. Exactly one is required (as in the database constraint).
export interface TrainingTarget {
  internshipId: string | null;
  requestedTraining: string | null;
}

export function parseTrainingTarget(
  internshipId: string | null,
  requestedTraining: string | null,
): TrainingTarget {
  const cleanRequestedTraining = requestedTraining?.trim() || null;

  if (!internshipId && !cleanRequestedTraining) {
    throw new BadRequestException(
      'Please select an internship or enter the training area you are interested in.',
    );
  }

  if (internshipId && cleanRequestedTraining) {
    throw new BadRequestException(
      'Choose either an available internship or another training area, not both.',
    );
  }

  return { internshipId, requestedTraining: cleanRequestedTraining };
}
