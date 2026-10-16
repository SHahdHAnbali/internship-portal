import { useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import { applicationDetailsKey, hrApplicationsKey } from '@/features/applications/hooks/query-keys';
import { updateApplicationStatus } from '@/features/applications/services/applications.service';
import { selectionBlockedReason } from '@/features/applications/selection-eligibility';
import { APPLICATION_STATUS_LABELS } from '@/features/applications/status';
import type { ApplicationDetails, HrTargetStatus } from '@/features/applications/types';

const REASON_MAX = 1000;
const NOTE_MAX = 2000;

const STAGE_HINTS: Record<HrTargetStatus, string> = {
  UNDER_REVIEW: 'HR is reviewing the application.',
  SHORTLISTED: 'The applicant is on the shortlist.',
  INTERVIEW: 'The applicant is invited to interview.',
  SELECTED: 'Final decision: the applicant is selected. A placement can then be created.',
  REJECTED: 'Final decision: the application is rejected. The applicant will see the reason you give.',
};

// HR status decisions. Only server-allowed transitions are offered, every
// change is confirmed, and the database enforces the rules regardless.
export default function StatusDecisionPanel({ application }: { application: ApplicationDetails }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<HrTargetStatus | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      updateApplicationStatus(application.id, {
        status: target!,
        reason: target === 'REJECTED' ? reason.trim() : null,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationDetailsKey(application.id) }),
        queryClient.invalidateQueries({ queryKey: hrApplicationsKey }),
      ]);
    },
  });

  function open(status: HrTargetStatus) {
    mutation.reset();
    setTarget(status);
    setReason('');
    setNote('');
    setTouched(false);
  }

  function close() {
    setTarget(null);
  }

  const reasonMissing = target === 'REJECTED' && reason.trim().length === 0;
  const isFinal = target === 'SELECTED' || target === 'REJECTED';
  const stages = application.allowedTransitions.filter((status) => status !== 'SELECTED' && status !== 'REJECTED');
  const canDecide = application.allowedTransitions.includes('SELECTED');
  const selectBlocked = selectionBlockedReason(application);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current status: <span className="font-medium text-foreground">{APPLICATION_STATUS_LABELS[application.status]}</span>
          </p>
        </div>

        {application.allowedTransitions.length === 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            This application has a final decision and can no longer change status.
          </p>
        ) : (
          <>
            {stages.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Move to stage</p>
                <div className="flex flex-wrap gap-2">
                  {stages.map((status) => (
                    <Button key={status} type="button" variant="outline" size="sm" onClick={() => open(status)}>
                      {APPLICATION_STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {canDecide && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Final decision</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => open('SELECTED')} className="gap-1.5" disabled={selectBlocked !== null}>
                    <CheckCircle2 className="h-4 w-4" /> Select
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => open('REJECTED')} className="gap-1.5">
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
                {selectBlocked && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{selectBlocked}</p>
                )}
                {application.opportunity && !selectBlocked && (
                  <p className="text-xs text-muted-foreground">
                    {application.opportunity.title}: {application.opportunity.seatsConsumed} of {application.opportunity.capacity} seats consumed,
                    {' '}{application.opportunity.remainingSeats} remaining.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {application.status === 'REJECTED' && application.rejectionReason && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">Reason shown to the applicant</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{application.rejectionReason}</p>
          </div>
        )}
      </CardContent>

      <Dialog open={target !== null} onOpenChange={(isOpen) => { if (!isOpen && !mutation.isPending) close(); }}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (!reasonMissing && !mutation.isPending) mutation.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {target === 'SELECTED' ? 'Select this applicant?' : target === 'REJECTED' ? 'Reject this application?' : `Move to ${target ? APPLICATION_STATUS_LABELS[target] : ''}?`}
              </DialogTitle>
              <DialogDescription>
                {target && STAGE_HINTS[target]}
                {isFinal && ' This cannot be undone.'}
              </DialogDescription>
            </DialogHeader>

            {target === 'REJECTED' && (
              <label className="block space-y-1.5 text-sm font-medium">
                Reason for the applicant <span className="text-destructive">*</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={REASON_MAX}
                  rows={3}
                  aria-invalid={touched && reasonMissing}
                  placeholder="Explain the decision respectfully. The applicant will see this."
                  disabled={mutation.isPending}
                />
                {touched && reasonMissing && (
                  <span className="block text-xs font-normal text-destructive">A rejection reason is required.</span>
                )}
              </label>
            )}

            <label className="block space-y-1.5 text-sm font-medium">
              Internal note <span className="font-normal text-muted-foreground">(optional, HR only)</span>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={NOTE_MAX}
                rows={3}
                placeholder="Visible to HR in the status history; never shown to the applicant."
                disabled={mutation.isPending}
              />
            </label>

            {mutation.isError && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={target === 'REJECTED' ? 'destructive' : 'default'}
                disabled={mutation.isPending}
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {target === 'SELECTED' ? 'Confirm selection' : target === 'REJECTED' ? 'Confirm rejection' : 'Confirm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
