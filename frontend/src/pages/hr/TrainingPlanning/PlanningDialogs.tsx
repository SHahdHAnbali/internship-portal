import { useState, type FormEvent } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SELECTION_STATUS_HINTS, SELECTION_STATUS_LABELS } from '@/features/internships/selection-status';
import type { PlannedOpportunity, SelectionStatus } from '@/features/internships/types';

export interface OpportunityFormValues {
  title: string;
  isActive: boolean;
  capacity: number | null;
  note: string | null;
  selectionStatus: SelectionStatus;
}

// Create or edit a training opportunity. Listing (applicants may request it),
// approval (HR may select) and capacity are separate decisions.
export function OpportunityDialog({
  open,
  opportunity,
  initialTitle,
  isSaving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  opportunity: PlannedOpportunity | null;
  initialTitle?: string;
  isSaving: boolean;
  error: string | null;
  onSubmit: (values: OpportunityFormValues) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <OpportunityForm
            key={opportunity?.id ?? `new:${initialTitle ?? ''}`}
            opportunity={opportunity}
            initialTitle={initialTitle}
            isSaving={isSaving}
            error={error}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OpportunityForm({
  opportunity,
  initialTitle,
  isSaving,
  error,
  onSubmit,
  onClose,
}: {
  opportunity: PlannedOpportunity | null;
  initialTitle?: string;
  isSaving: boolean;
  error: string | null;
  onSubmit: (values: OpportunityFormValues) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(opportunity?.title ?? initialTitle ?? '');
  const [capacity, setCapacity] = useState(opportunity?.capacity?.toString() ?? '');
  const [isActive, setIsActive] = useState(opportunity?.isActive ?? true);
  const [selectionStatus, setSelectionStatus] = useState<SelectionStatus>(opportunity?.selectionStatus ?? 'NOT_APPROVED');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Seats in use cannot be planned away; approval cannot be withdrawn once
  // anyone was selected.
  const consumed = opportunity?.seats.consumed ?? 0;
  const everSelected = opportunity?.seats.selected ?? 0;
  const statusOptions: SelectionStatus[] = opportunity ? ['NOT_APPROVED', 'OPEN', 'CLOSED'] : ['NOT_APPROVED', 'OPEN'];
  const capacityNumber = capacity.trim() === '' ? null : Number(capacity);
  const errors: Record<string, string> = {};
  if (!title.trim()) errors.title = 'Enter a title.';
  else if (title.trim().length > 150) errors.title = 'Use at most 150 characters.';
  if (capacityNumber !== null && (!Number.isInteger(capacityNumber) || capacityNumber < 0 || capacityNumber > 10000)) {
    errors.capacity = 'Enter a whole number from 0 to 10000, or leave empty.';
  } else if (capacityNumber !== null && capacityNumber < consumed) {
    errors.capacity = `At least ${consumed}: that many seats are consumed by selected applicants.`;
  } else if (capacityNumber === null && consumed > 0) {
    errors.capacity = 'A capacity is required while selected applicants hold seats.';
  }
  if (selectionStatus === 'NOT_APPROVED' && everSelected > 0) {
    errors.selectionStatus = 'Applicants were already selected, so approval cannot be withdrawn. Close selection instead.';
  }
  const shown = submitted ? errors : {};

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || isSaving) return;
    onSubmit({ title: title.trim(), isActive, capacity: capacityNumber, note: note.trim() || null, selectionStatus });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{opportunity ? 'Edit training opportunity' : 'New training opportunity'}</DialogTitle>
        <DialogDescription>
          Applicants may request a listed training before it is approved. Approve it once demand and resources justify it,
          then set capacity: the number of applicants that may be selected over this cycle. Completed or cancelled placements
          keep their seats; only releasing a selection frees one.
        </DialogDescription>
      </DialogHeader>

      <label className="block space-y-1.5 text-sm font-medium">
        Title <span className="text-destructive">*</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} aria-invalid={Boolean(shown.title)} disabled={isSaving} />
        {shown.title && <span className="block text-xs font-normal text-destructive">{shown.title}</span>}
      </label>

      <label className="block space-y-1.5 text-sm font-medium">
        Capacity (seats)
        <Input type="number" min={consumed} max={10000} step={1} inputMode="numeric" value={capacity}
          onChange={(e) => setCapacity(e.target.value)} placeholder="Not set yet" aria-invalid={Boolean(shown.capacity)} disabled={isSaving} />
        {shown.capacity ? (
          <span className="block text-xs font-normal text-destructive">{shown.capacity}</span>
        ) : opportunity ? (
          <span className="block text-xs font-normal text-muted-foreground">
            {consumed} seat{consumed === 1 ? '' : 's'} consumed ({everSelected} selected, {opportunity.seats.released} released).
          </span>
        ) : (
          <span className="block text-xs font-normal text-muted-foreground">Optional now; selection needs a capacity.</span>
        )}
      </label>

      <label className="block space-y-1.5 text-sm font-medium">
        Selection status
        <select
          value={selectionStatus}
          onChange={(e) => setSelectionStatus(e.target.value as SelectionStatus)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-invalid={Boolean(shown.selectionStatus)}
          disabled={isSaving}
        >
          {statusOptions.map((value) => (
            <option key={value} value={value}>{value === 'OPEN' && !opportunity ? 'Approve now (selection open)' : SELECTION_STATUS_LABELS[value]}</option>
          ))}
        </select>
        {shown.selectionStatus ? (
          <span className="block text-xs font-normal text-destructive">{shown.selectionStatus}</span>
        ) : (
          <span className="block text-xs font-normal text-muted-foreground">{SELECTION_STATUS_HINTS[selectionStatus]}</span>
        )}
      </label>

      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSaving} />
        <span>
          <span className="font-medium">Listed for applicants</span>
          <span className="block text-xs text-muted-foreground">
            Applicants can request it on the Apply page. Independent of approval and capacity; unlisting does not affect
            applications already received.
          </span>
        </span>
      </label>

      <label className="block space-y-1.5 text-sm font-medium">
        Note <span className="font-normal text-muted-foreground">(optional, kept in the planning history)</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} disabled={isSaving} />
      </label>

      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {opportunity ? 'Save changes' : 'Create opportunity'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Link an "Other" request label to an existing opportunity.
export function LinkRequestDialog({
  label,
  opportunities,
  isSaving,
  error,
  onSubmit,
  onClose,
}: {
  label: string | null;
  opportunities: PlannedOpportunity[];
  isSaving: boolean;
  error: string | null;
  onSubmit: (internshipId: string, note: string | null) => void;
  onClose: () => void;
}) {
  const [internshipId, setInternshipId] = useState('');
  const [note, setNote] = useState('');

  return (
    <Dialog open={label !== null} onOpenChange={(isOpen) => { if (!isOpen && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (internshipId && !isSaving) onSubmit(internshipId, note.trim() || null);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Link “{label}” to an opportunity</DialogTitle>
            <DialogDescription>
              Applications that requested this training will count toward the chosen opportunity’s demand and seats. What applicants asked for is not changed.
            </DialogDescription>
          </DialogHeader>

          <label className="block space-y-1.5 text-sm font-medium">
            Training opportunity <span className="text-destructive">*</span>
            <select
              value={internshipId}
              onChange={(e) => setInternshipId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={isSaving}
              required
            >
              <option value="">Choose an opportunity…</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>
                  {opportunity.title}{opportunity.isActive ? '' : ' (closed)'}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm font-medium">
            Note <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} disabled={isSaving} />
          </label>

          {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button type="submit" disabled={!internshipId || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
