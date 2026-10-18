import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { applicationPlacementKey } from '@/features/applications/hooks/query-keys';
import {
  assignHrPlacementMentor,
  getHrMentors,
  unassignHrPlacementMentor,
  type HrMentorProfile,
} from '@/features/hr/services/intern-placement.service';

const mentorsKey = ['hr', 'mentors'] as const;

// HR assigns, changes or removes the Mentor of an open placement. Only active
// Mentor accounts are offered; workload counts are information only. An
// active placement always keeps a Mentor: it can be changed, not removed (the
// server enforces this).
export default function PlacementMentorAssignment({
  applicationId,
  placementId,
  mentorProfileId,
  canChange,
  canRemove,
}: {
  applicationId: string;
  placementId: string;
  mentorProfileId: string | null;
  canChange: boolean;
  canRemove: boolean;
}) {
  const queryClient = useQueryClient();
  const mentors = useQuery({ queryKey: mentorsKey, queryFn: getHrMentors, retry: false });
  const [selectedMentorId, setSelectedMentorId] = useState(mentorProfileId ?? '');
  const [removing, setRemoving] = useState(false);
  const [note, setNote] = useState('');

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: applicationPlacementKey(applicationId) }),
      queryClient.invalidateQueries({ queryKey: mentorsKey }),
    ]);
  }

  const assign = useMutation({
    mutationFn: () => assignHrPlacementMentor(placementId, selectedMentorId),
    onSuccess: refresh,
  });
  const unassign = useMutation({
    mutationFn: () => unassignHrPlacementMentor(placementId, note.trim() || null),
    onSuccess: async () => {
      setRemoving(false);
      await refresh();
    },
  });

  const assignedMentor = mentors.data?.find((mentor) => mentor.id === mentorProfileId);
  const busy = assign.isPending || unassign.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><UserRound className="size-5 text-primary" />Placement Mentor</CardTitle>
        <CardDescription>
          The Mentor supervises this intern and reviews their weekly reports. Changing the Mentor removes the previous
          Mentor’s access immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Currently assigned: <span className="font-medium">
              {mentorProfileId ? (assignedMentor ? mentorLabel(assignedMentor) : 'A Mentor who is no longer active') : 'No Mentor'}
            </span>
          </p>
          {canChange && canRemove && mentorProfileId && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { unassign.reset(); setNote(''); setRemoving(true); }}>
              Remove Mentor
            </Button>
          )}
        </div>

        {canChange && !canRemove && mentorProfileId && (
          <p className="text-sm text-muted-foreground">
            An active placement must always have a Mentor. To change it, choose a replacement below and select
            Change Mentor.
          </p>
        )}

        {!canChange ? (
          <p className="text-sm text-muted-foreground">The Mentor can only be changed while the placement is scheduled or active.</p>
        ) : mentors.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading Mentors…</p>
        ) : mentors.isError ? (
          <div role="alert" className="text-sm text-destructive">{mentors.error.message}</div>
        ) : mentors.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no active Mentor accounts yet. An administrator can add Mentors in User Management.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Select placement Mentor"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedMentorId}
              onChange={(event) => {
                setSelectedMentorId(event.target.value);
                assign.reset();
              }}
              disabled={busy}
            >
              <option value="">Select a Mentor</option>
              {mentors.data.map((mentor) => (
                <option key={mentor.id} value={mentor.id}>
                  {mentorLabel(mentor)} — {mentor.openPlacements} open placement{mentor.openPlacements === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!selectedMentorId || selectedMentorId === mentorProfileId || busy}
              onClick={() => assign.mutate()}
            >
              {assign.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              {assign.isPending ? 'Saving…' : mentorProfileId ? 'Change Mentor' : 'Assign Mentor'}
            </Button>
          </div>
        )}
        {assign.isError && <p role="alert" className="text-sm text-destructive">{assign.error.message}</p>}
        {assign.isSuccess && <p role="status" className="text-sm text-emerald-700">Mentor assignment saved.</p>}
        {unassign.isSuccess && <p role="status" className="text-sm text-emerald-700">The Mentor was removed from this placement.</p>}
      </CardContent>

      <Dialog open={removing} onOpenChange={(isOpen) => { if (!isOpen && !unassign.isPending) setRemoving(false); }}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unassign.isPending) unassign.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Remove the Mentor?</DialogTitle>
              <DialogDescription>
                The Mentor loses access to this intern and their weekly reports. Existing reports stay with the placement.
                The placement cannot be activated until a Mentor is assigned again.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Reason <span className="font-normal text-muted-foreground">(optional, kept in the placement history)</span>
              <Textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={unassign.isPending} />
            </label>
            {unassign.isError && <p role="alert" className="text-sm text-destructive">{unassign.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRemoving(false)} disabled={unassign.isPending}>Back</Button>
              <Button type="submit" variant="destructive" disabled={unassign.isPending}>
                {unassign.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                Remove Mentor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function mentorLabel(mentor: HrMentorProfile) {
  const name = mentor.fullName || mentor.email || 'Mentor';
  return mentor.fullName && mentor.email ? `${name} · ${mentor.email}` : name;
}
