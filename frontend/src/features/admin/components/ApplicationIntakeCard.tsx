import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorClosed, DoorOpen, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

import { formatDateTime } from '../format';
import { adminKey } from '../hooks/useAdmin';
import { getApplicationIntakeSetting, setApplicationIntake } from '../services/admin.service';
import { ErrorBox, Loading } from './QueryState';

const intakeKey = [...adminKey, 'application-intake'] as const;

// Portal-wide application intake. Closed: no new applications (including
// "Other" requests) and no pending reviews can be finalized; drafts and CVs are
// kept. HR review, selection and placements are not affected.
export default function ApplicationIntakeCard() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: intakeKey, queryFn: getApplicationIntakeSetting, retry: false });
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  const change = useMutation({
    mutationFn: (open: boolean) => setApplicationIntake(open, note.trim() || null),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: adminKey });
    },
  });

  if (setting.isPending) return <Card><CardContent className="p-6"><Loading /></CardContent></Card>;
  if (setting.isError) return <ErrorBox message={setting.error.message} onRetry={() => void setting.refetch()} />;

  const open = setting.data.applicationsOpen;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Application intake</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`flex items-center gap-2 font-medium ${open ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {open ? <DoorOpen className="size-4" /> : <DoorClosed className="size-4" />}
            {open ? 'Accepting applications' : 'Applications closed'}
          </p>
          <Button variant={open ? 'destructive' : 'default'} size="sm" onClick={() => { change.reset(); setNote(''); setConfirming(true); }}>
            {open ? 'Close applications' : 'Open applications'}
          </Button>
        </div>
        <p className="text-muted-foreground">
          Last changed {formatDateTime(setting.data.updatedAt)}{setting.data.updatedBy ? ` by ${setting.data.updatedBy}` : ''}.
          Closing stops new applications, including “Other” requests, and the finalizing of reviews already in progress.
          Drafts and CVs are kept. HR can still review, select and place applicants.
        </p>
      </CardContent>

      <Dialog open={confirming} onOpenChange={(isOpen) => { if (!isOpen && !change.isPending) setConfirming(false); }}>
        <DialogContent className="sm:max-w-lg">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!change.isPending) change.mutate(!open); }}>
            <DialogHeader>
              <DialogTitle>{open ? 'Close applications?' : 'Open applications?'}</DialogTitle>
              <DialogDescription>
                {open
                  ? 'Applicants will see that applications are closed. Nobody can submit a new application or finish a review in progress until you open them again.'
                  : 'Applicants can submit applications and finish reviews again (expired review links stay expired).'}
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional, kept in the audit trail)</span>
              <Textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={change.isPending} />
            </label>
            {change.isError && <p role="alert" className="text-sm text-destructive">{change.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={change.isPending}>Cancel</Button>
              <Button type="submit" variant={open ? 'destructive' : 'default'} disabled={change.isPending}>
                {change.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {open ? 'Close applications' : 'Open applications'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
