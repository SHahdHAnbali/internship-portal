import type { ApplicationDetails } from './types';

// Why selecting is not possible right now (mirrors the server's rules; the
// server still decides). Null when selection is possible.
export function selectionBlockedReason(application: ApplicationDetails): string | null {
  const opportunity = application.opportunity;
  if (!opportunity) {
    return 'This requested training is not linked to an approved training opportunity yet. Link or create one in Training Planning.';
  }
  if (opportunity.selectionStatus === 'NOT_APPROVED') {
    return `“${opportunity.title}” is not approved yet. Approve it in Training Planning before selecting.`;
  }
  if (opportunity.selectionStatus === 'CLOSED') {
    return `Selection is closed for “${opportunity.title}”. Reopen selection in Training Planning to select more applicants.`;
  }
  if (opportunity.capacity === null) {
    return `Set the capacity of “${opportunity.title}” in Training Planning before selecting.`;
  }
  if ((opportunity.remainingSeats ?? 0) <= 0) {
    return `All ${opportunity.capacity} seats of “${opportunity.title}” are consumed. Completed or cancelled placements keep their seats; only releasing a selection or raising capacity frees one.`;
  }
  return null;
}
