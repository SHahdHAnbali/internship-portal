import { useState, type FormEvent } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { applicationDetailsKey, applicationPlacementKey } from '@/features/applications/hooks/query-keys';
import type { ApplicationDetails } from '@/features/applications/types';
import { trainingPlanKey } from '@/features/internships/hooks/useInternships';
import {
  activateHrInternPlacement,
  cancelHrInternPlacement,
  completeHrInternPlacement,
  createHrInternPlacement,
  getHrApplicationPlacement,
  type HrApplicationPlacementOverview,
  type HrInternPlacement,
} from '@/features/hr/services/intern-placement.service';

import PlacementHistory from './PlacementHistory';
import PlacementMentorAssignment from './PlacementMentorAssignment';

const TEXT_MAX = 200;
const REASON_MAX = 1000;

// Placement for a SELECTED application: create it, activate or cancel it,
// assign a Mentor. The database enforces every rule (seats, dates, states).
export default function PlacementSection({ application }: { application: ApplicationDetails }) {
  const placementQuery = useQuery({
    queryKey: applicationPlacementKey(application.id),
    queryFn: () => getHrApplicationPlacement(application.id),
    retry: false,
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-xl font-semibold">Internship placement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule a placement for this selected applicant, then activate it when the internship starts.
            Activation turns the applicant’s account into an intern account.
          </p>
        </div>

        {placementQuery.isPending ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading placement…
          </div>
        ) : placementQuery.isError ? (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {placementQuery.error.message}
            <Button type="button" variant="outline" className="ml-3" onClick={() => void placementQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <PlacementContent application={application} overview={placementQuery.data} />
        )}
      </CardContent>
    </Card>
  );
}

function PlacementContent({
  application,
  overview,
}: {
  application: ApplicationDetails;
  overview: HrApplicationPlacementOverview;
}) {
  const queryClient = useQueryClient();
  const placement = overview.current;
  const [dialog, setDialog] = useState<'activate' | 'cancel' | 'complete' | null>(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: applicationPlacementKey(application.id) }),
      queryClient.invalidateQueries({ queryKey: applicationDetailsKey(application.id) }),
      queryClient.invalidateQueries({ queryKey: trainingPlanKey }),
    ]);
  }

  const activate = useMutation({
    mutationFn: (placementId: string) => activateHrInternPlacement(placementId),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
    },
  });

  const cancel = useMutation({
    mutationFn: ({ placementId, text }: { placementId: string; text: string }) =>
      cancelHrInternPlacement(placementId, text),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
    },
  });

  const complete = useMutation({
    mutationFn: ({ placementId, text }: { placementId: string; text: string | null }) =>
      completeHrInternPlacement(placementId, text),
    onSuccess: async () => {
      setDialog(null);
      await refresh();
    },
  });

  function openDialog(kind: 'activate' | 'cancel' | 'complete') {
    activate.reset();
    cancel.reset();
    complete.reset();
    setReason('');
    setReasonTouched(false);
    setDialog(kind);
  }

  const busy = activate.isPending || cancel.isPending || complete.isPending;
  const endsEarly = placement !== null && localIsoDate() < placement.endDate;
  const reasonMissing = reason.trim().length === 0;
  // A cancelled placement can be replaced only while selection is OPEN; a
  // released selection never gets another placement (the server enforces both).
  const replacementBlocked = overview.cancelled.length > 0 && overview.selectionStatus !== 'OPEN';

  return (
    <>
      <SeatSummary overview={overview} />

      {placement ? (
        <>
          <div className="flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center">
            <div className="space-y-2">
              <p className="font-semibold">{placement.company}{placement.department ? ` · ${placement.department}` : ''}</p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" /> {placement.startDate} – {placement.endDate}
              </p>
              <p className="text-sm">Status: <span className="font-medium">{PLACEMENT_STATUS_LABELS[placement.status]}</span></p>
              {placement.status === 'COMPLETED' && placement.completedAt && (
                <p className="text-sm text-muted-foreground">
                  {placement.endedEarly ? 'Ended early' : 'Completed'} on {new Date(placement.completedAt).toLocaleDateString()}
                  {placement.completionNote && <> — {placement.completionNote}</>}
                </p>
              )}
            </div>
            {placement.status === 'ACTIVE' && (
              <Button type="button" variant="outline" onClick={() => openDialog('complete')}>Complete placement</Button>
            )}
            {placement.status === 'SCHEDULED' && (
              <div className="space-y-2 sm:max-w-xs sm:text-right">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    onClick={() => openDialog('activate')}
                    disabled={!placement.mentorProfileId}
                    aria-describedby={placement.mentorProfileId ? undefined : 'activation-needs-mentor'}
                  >
                    Activate placement
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openDialog('cancel')}>Cancel placement</Button>
                </div>
                {/* The server refuses activation without an eligible Mentor; this only explains it. */}
                {!placement.mentorProfileId && (
                  <p id="activation-needs-mentor" className="text-sm text-muted-foreground">
                    Assign a Mentor below before activating this placement.
                  </p>
                )}
              </div>
            )}
          </div>

          <PlacementMentorAssignment
            key={`${placement.id}:${placement.mentorProfileId ?? 'unassigned'}`}
            applicationId={application.id}
            placementId={placement.id}
            mentorProfileId={placement.mentorProfileId}
            canChange={placement.status === 'SCHEDULED' || placement.status === 'ACTIVE'}
            canRemove={placement.status === 'SCHEDULED'}
          />
        </>
      ) : overview.selectionReleased ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This selection was released, so this applicant cannot receive another placement.
        </p>
      ) : replacementBlocked ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          The previous placement was cancelled. A replacement needs selection to be open for this training
          (Training Planning). The applicant still holds a seat until HR releases the selection.
        </p>
      ) : (
        <CreatePlacementForm
          applicationId={application.id}
          hasCancelled={overview.cancelled.length > 0}
          onCreated={refresh}
        />
      )}

      {overview.cancelled.length > 0 && <CancelledPlacements placements={overview.cancelled} />}

      <PlacementHistory events={overview.history} />

      <Dialog open={dialog !== null} onOpenChange={(isOpen) => { if (!isOpen && !busy) setDialog(null); }}>
        <DialogContent className="sm:max-w-lg">
          {placement && dialog === 'activate' && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>Activate this placement?</DialogTitle>
                <DialogDescription>
                  The applicant’s account becomes an intern account and they get access to the intern portal.
                  This uses one seat of the training and cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {activate.isError && <ErrorMessage message={activate.error.message} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>Back</Button>
                <Button type="button" onClick={() => activate.mutate(placement.id)} disabled={busy || !placement.mentorProfileId}>
                  {activate.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Confirm activation
                </Button>
              </DialogFooter>
            </div>
          )}
          {placement && dialog === 'complete' && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setReasonTouched(true);
                if ((endsEarly && reason.trim() === '') || busy) return;
                complete.mutate({ placementId: placement.id, text: reason.trim() || null });
              }}
            >
              <DialogHeader>
                <DialogTitle>{endsEarly ? 'End this placement early?' : 'Complete this placement?'}</DialogTitle>
                <DialogDescription>
                  {endsEarly
                    ? `The planned end date is ${placement.endDate}. Ending now requires a reason.`
                    : 'The internship has reached its planned end date.'}
                  {' '}The intern keeps read-only access to their weekly reports, and the Mentor can no longer
                  change them. Reports awaiting review must be reviewed first. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <label className="block space-y-1.5 text-sm font-medium">
                {endsEarly ? <>Reason <span className="text-destructive">*</span></> : <>Note <span className="font-normal text-muted-foreground">(optional)</span></>}
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={REASON_MAX}
                  rows={3}
                  aria-invalid={reasonTouched && endsEarly && reason.trim() === ''}
                  placeholder="Visible to HR in the placement history."
                  disabled={busy}
                />
                {reasonTouched && endsEarly && reason.trim() === '' && (
                  <span className="block text-xs font-normal text-destructive">A reason is required to end early.</span>
                )}
              </label>
              {complete.isError && <ErrorMessage message={complete.error.message} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>Back</Button>
                <Button type="submit" disabled={busy}>
                  {complete.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {endsEarly ? 'End placement' : 'Complete placement'}
                </Button>
              </DialogFooter>
            </form>
          )}
          {placement && dialog === 'cancel' && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setReasonTouched(true);
                if (!reasonMissing && !busy) cancel.mutate({ placementId: placement.id, text: reason.trim() });
              }}
            >
              <DialogHeader>
                <DialogTitle>Cancel this placement?</DialogTitle>
                <DialogDescription>
                  The scheduled placement is closed and kept in the history. The application stays selected,
                  so a new placement can be scheduled afterwards.
                </DialogDescription>
              </DialogHeader>
              <label className="block space-y-1.5 text-sm font-medium">
                Reason <span className="text-destructive">*</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={REASON_MAX}
                  rows={3}
                  aria-invalid={reasonTouched && reasonMissing}
                  placeholder="Why is the placement cancelled? Visible to HR only."
                  disabled={busy}
                />
                {reasonTouched && reasonMissing && (
                  <span className="block text-xs font-normal text-destructive">A cancellation reason is required.</span>
                )}
              </label>
              {cancel.isError && <ErrorMessage message={cancel.error.message} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>Back</Button>
                <Button type="submit" variant="destructive" disabled={busy}>
                  {cancel.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Confirm cancellation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const PLACEMENT_STATUS_LABELS: Record<HrInternPlacement['status'], string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function SeatSummary({ overview }: { overview: HrApplicationPlacementOverview }) {
  if (!overview.trainingTitle) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        This application’s training is not linked to a training opportunity. Link it in Training Planning first.
      </p>
    );
  }
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-sm">
      <span className="font-medium">{overview.trainingTitle}</span>
      <span className="text-muted-foreground">
        {' · '}
        {overview.capacity === null
          ? 'Seats not set — set them in Training Planning before activating.'
          : `${overview.seatsConsumed} of ${overview.capacity} seats consumed (completed and cancelled placements keep their seat)`}
      </span>
    </div>
  );
}

function CreatePlacementForm({
  applicationId,
  hasCancelled,
  onCreated,
}: {
  applicationId: string;
  hasCancelled: boolean;
  onCreated: () => Promise<void>;
}) {
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const today = localIsoDate();

  const create = useMutation({
    mutationFn: () =>
      createHrInternPlacement(applicationId, {
        company: company.trim(),
        department: department.trim() || null,
        startDate,
        endDate,
      }),
    onSuccess: onCreated,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    if (!company.trim()) {
      setFormError('Enter a company name.');
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setFormError('Enter valid dates with the end date on or after the start date.');
      return;
    }
    if (endDate < today) {
      setFormError('The end date has already passed.');
      return;
    }
    setFormError(null);
    create.mutate();
  }

  const error = formError ?? (create.isError ? create.error.message : null);

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      {hasCancelled && (
        <p className="text-sm text-muted-foreground md:col-span-2">
          The previous placement was cancelled. You can schedule a new one.
        </p>
      )}
      {error && <div className="md:col-span-2"><ErrorMessage message={error} /></div>}
      <label className="space-y-2 text-sm font-medium">
        Company <span className="text-destructive">*</span>
        <Input required maxLength={TEXT_MAX} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company name" disabled={create.isPending} />
      </label>
      <label className="space-y-2 text-sm font-medium">
        Department <span className="font-normal text-muted-foreground">(optional)</span>
        <Input maxLength={TEXT_MAX} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Department" disabled={create.isPending} />
      </label>
      <label className="space-y-2 text-sm font-medium">
        Start date <span className="text-destructive">*</span>
        <Input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={create.isPending} />
      </label>
      <label className="space-y-2 text-sm font-medium">
        End date <span className="text-destructive">*</span>
        <Input type="date" required min={maxDate(startDate, today)} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={create.isPending} />
      </label>
      <div className="md:col-span-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {create.isPending ? 'Scheduling placement…' : 'Schedule placement'}
        </Button>
      </div>
    </form>
  );
}

function CancelledPlacements({ placements }: { placements: HrInternPlacement[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Cancelled placements</h3>
      <ul className="space-y-2">
        {placements.map((placement) => (
          <li key={placement.id} className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">
              {placement.company}{placement.department ? ` · ${placement.department}` : ''}
              <span className="font-normal text-muted-foreground"> · {placement.startDate} – {placement.endDate}</span>
            </p>
            {placement.cancellationReason && (
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">Reason: {placement.cancellationReason}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
      {message}
    </p>
  );
}

function localIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function maxDate(a: string, b: string) {
  return a && a > b ? a : b;
}
