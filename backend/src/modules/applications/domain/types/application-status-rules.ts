import { ApplicationStatus } from '../enums/application-status.enum.js';

// Mirrors update_application_status_v2 (the database is the authority):
// review stages only move forward and may be skipped; SELECTED and REJECTED
// are final; drafts are not manageable by HR.
const REVIEW_STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
  [ApplicationStatus.NEW]: 1,
  [ApplicationStatus.UNDER_REVIEW]: 2,
  [ApplicationStatus.SHORTLISTED]: 3,
  [ApplicationStatus.INTERVIEW]: 4,
};

export const HR_TARGET_STATUSES = [
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.SELECTED,
  ApplicationStatus.REJECTED,
] as const;

export type HrTargetStatus = (typeof HR_TARGET_STATUSES)[number];

export function allowedHrTransitions(current: ApplicationStatus): HrTargetStatus[] {
  const currentRank = REVIEW_STAGE_RANK[current];
  if (currentRank === undefined) {
    return [];
  }

  return HR_TARGET_STATUSES.filter((target) => {
    const targetRank = REVIEW_STAGE_RANK[target];
    return targetRank === undefined || targetRank > currentRank;
  });
}

export function isFinalDecision(status: ApplicationStatus): boolean {
  return status === ApplicationStatus.SELECTED || status === ApplicationStatus.REJECTED;
}
