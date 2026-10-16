import type { SelectionStatus } from './types';

export const SELECTION_STATUS_LABELS: Record<SelectionStatus, string> = {
  NOT_APPROVED: 'Awaiting approval',
  OPEN: 'Selection open',
  CLOSED: 'Selection closed',
};

export const SELECTION_STATUS_HINTS: Record<SelectionStatus, string> = {
  NOT_APPROVED: 'Demand only. HR has not approved this training, so no applicant can be selected.',
  OPEN: 'Approved. HR may select applicants while seats remain.',
  CLOSED: 'Approved, but no further selections or replacements, even if a seat is released.',
};

export const SELECTION_STATUS_STYLES: Record<SelectionStatus, string> = {
  NOT_APPROVED: 'bg-amber-50 text-amber-700',
  OPEN: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};
