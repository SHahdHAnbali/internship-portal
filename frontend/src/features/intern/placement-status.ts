import type { MyInternPlacement } from './types';

// Badge text and colours for the intern's own placement.
export function placementBadge(placement: MyInternPlacement): { label: string; className: string } {
  if (placement.status === 'COMPLETED') {
    return {
      label: placement.endedEarly ? 'Ended early' : 'Completed',
      className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
    };
  }
  return { label: 'Active', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' };
}
