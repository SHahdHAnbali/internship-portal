import { useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Unlock } from 'lucide-react';

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
import { applicationDetailsKey, applicationPlacementKey } from '@/features/applications/hooks/query-keys';
import { releaseApplicationSelection } from '@/features/applications/services/applications.service';
import type { ApplicationDetails } from '@/features/applications/types';
import { trainingPlanKey } from '@/features/internships/hooks/useInternships';

const REASON_MAX = 1000;

// Release Selection: frees this applicant's seat for the opportunity. Final for
// this application; it stays SELECTED for the record. The server decides.
export default function SelectionReleaseCard({ application }: { application: ApplicationDetails }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const release = useMutation({
    mutationFn: () => releaseApplicationSelection(application.id, reason.trim()),
    onSuccess: () => setOpen(false),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationDetailsKey(application.id) }),
        queryClient.invalidateQueries({ queryKey: applicationPlacementKey(application.id) }),
        queryClient.invalidateQueries({ queryKey: trainingPlanKey }),
      ]);
    },
  });

  const released = application.selectionRelease;
  if (application.status !== 'SELECTED' || (!released && !application.canReleaseSelection)) {
    return null;
  }

  const reasonMissing = reason.trim() === '';

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Unlock className="h-4 w-4" /> Selection seat</h2>
        {released ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Selection released — seat freed</p>
            <p className="text-muted-foreground">
              {new Date(released.releasedAt).toLocaleString()}{released.releasedBy ? ` · ${released.releasedBy}` : ''}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">Reason: {released.reason}</p>
            <p className="text-xs text-muted-foreground">
              The application stays selected for the record and cannot receive another placement.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This applicant holds a seat. If they will not take up the internship, release the selection to free the seat.
              Releasing is final: they cannot be placed again for this application.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => { release.reset(); setReason(''); setTouched(false); setOpen(true); }}>
              Release selection
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !release.isPending) setOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (!reasonMissing && !release.isPending) release.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Release this selection?</DialogTitle>
              <DialogDescription>
                The seat becomes available for another applicant, if selection is open for this training. The application
                stays selected for the record, and this applicant can never receive another placement for it.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Reason <span className="text-destructive">*</span>
              <Textarea
                rows={3}
                maxLength={REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={touched && reasonMissing}
                placeholder="For example: the applicant declined the offer."
                disabled={release.isPending}
              />
              {touched && reasonMissing && <span className="block text-xs font-normal text-destructive">A reason is required.</span>}
            </label>
            {release.isError && (
              <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{release.error.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={release.isPending}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={release.isPending}>
                {release.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Release selection
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
