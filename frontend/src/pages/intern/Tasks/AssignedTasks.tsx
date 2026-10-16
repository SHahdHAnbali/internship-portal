import { useRef, useState } from 'react';
import { AlertCircle, Check, ClipboardList, LoaderCircle, Play, RotateCw, Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import {
  useInternTasks,
  useUpdateInternTaskStatus,
  useWithdrawInternTaskSubmission,
} from '@/features/intern/hooks/useInternTasks';
import {
  canWithdrawSubmission,
  isTaskOverdue,
  TASK_PRIORITY_LABELS,
  taskStateLabel,
} from '@/features/intern/task-labels';
import type { InternTask } from '@/features/intern/types';

type Pending = { task: InternTask; status: 'IN_PROGRESS' | 'COMPLETED' } | null;

// Needs action first: changes requested, in progress, assigned; then waiting
// for review, accepted and cancelled.
function rank(task: InternTask) {
  if (task.status === 'IN_PROGRESS') return task.reviewStatus === 'CHANGES_REQUESTED' ? 0 : 1;
  if (task.status === 'ASSIGNED') return 2;
  if (task.status === 'COMPLETED') return task.reviewStatus === null ? 3 : 4;
  return 5;
}

export default function AssignedTasks() {
  const query = useInternTasks();
  const update = useUpdateInternTaskStatus();
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState('');
  const withdraw = useWithdrawInternTaskSubmission();
  const [withdrawTarget, setWithdrawTarget] = useState<InternTask | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Synchronous guard: two fast clicks can arrive before the button re-renders disabled.
  const withdrawInFlight = useRef(false);

  function openWithdraw(task: InternTask) {
    withdraw.reset();
    setNotice(null);
    setWithdrawTarget(task);
  }

  // The server is the authority: a refusal (deadline passed, already reviewed)
  // is shown in the dialog and the task list is refreshed by the hook.
  async function confirmWithdraw() {
    if (!withdrawTarget || withdrawInFlight.current) return;
    withdrawInFlight.current = true;
    try {
      await withdraw.mutateAsync(withdrawTarget.id);
      setWithdrawTarget(null);
      setNotice('Submission withdrawn successfully. You can continue working on your task.');
    } catch {
      // The error is shown in the dialog.
    } finally {
      withdrawInFlight.current = false;
    }
  }

  function open(task: InternTask, status: 'IN_PROGRESS' | 'COMPLETED') {
    update.reset();
    setNote('');
    setPending({ task, status });
  }

  async function confirm() {
    if (!pending || update.isPending) return;
    try {
      await update.mutateAsync({ taskId: pending.task.id, status: pending.status, note: note.trim() || null });
      setPending(null);
    } catch {
      // The error is shown in the dialog.
    }
  }

  const tasks = [...(query.data ?? [])].sort((a, b) =>
    rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">YOUR WORK</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Assigned Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tasks assigned to you by your Mentor. Track your progress, submit completed work for review, and withdraw your submission before the due date if you need to make corrections. Your Mentor will review your submissions and provide feedback.
        </p>
      </header>

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {query.isPending ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your tasks…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
          <AlertCircle className="size-6 text-destructive" />
          <div className="flex-1"><p className="font-semibold">Unable to load assigned tasks</p>
            <p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p></div>
          <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </CardContent></Card>
      ) : tasks.length ? (
        <div className="space-y-4">
          {tasks.map((task) => (
            <Card key={task.id} className={task.status === 'CANCELLED' ? 'opacity-70' : undefined}>
              <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <CardTitle className={task.status === 'CANCELLED' ? 'line-through' : undefined}>{task.title}</CardTitle>
                  {task.description && <CardDescription className="mt-2 whitespace-pre-wrap">{task.description}</CardDescription>}
                </div>
                <Badge variant={task.reviewStatus === 'CHANGES_REQUESTED' ? 'destructive' : task.status === 'COMPLETED' ? 'secondary' : 'outline'} className="w-fit shrink-0">
                  {taskStateLabel(task)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 border-t pt-4">
                {task.mentorFeedback && (
                  <p className="rounded-md bg-muted/50 p-3 text-sm"><span className="font-medium">Mentor feedback:</span> {task.mentorFeedback}</p>
                )}
                {task.cancellationReason && (
                  <p className="text-sm text-muted-foreground">Cancelled by your Mentor: {task.cancellationReason}</p>
                )}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-muted-foreground">
                    {TASK_PRIORITY_LABELS[task.priority]} priority · {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
                    {isTaskOverdue(task) && <span className="font-medium text-destructive"> · Overdue</span>}
                  </p>
                  {task.status === 'ASSIGNED' && (
                    <Button onClick={() => open(task, 'IN_PROGRESS')}><Play className="mr-2 size-4" />Start task</Button>
                  )}
                  {task.status === 'IN_PROGRESS' && (
                    <Button onClick={() => open(task, 'COMPLETED')}><Check className="mr-2 size-4" />Mark completed</Button>
                  )}
                  {canWithdrawSubmission(task) && (
                    <Button variant="outline" onClick={() => openWithdraw(task)}><Undo2 className="mr-2 size-4" />Withdraw submission</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground"><ClipboardList className="size-6" /></span>
          <h2 className="mt-5 text-lg font-semibold">No tasks assigned</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Tasks for your active placement will appear here when your Mentor assigns them.</p>
        </CardContent></Card>
      )}

      <Dialog open={pending !== null} onOpenChange={(isOpen) => { if (!isOpen && !update.isPending) setPending(null); }}>
        <DialogContent className="sm:max-w-lg">
          {pending && (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
              <DialogHeader>
                <DialogTitle>{pending.status === 'IN_PROGRESS' ? 'Start this task?' : 'Mark this task completed?'}</DialogTitle>
                <DialogDescription>
                  {pending.status === 'IN_PROGRESS'
                    ? `“${pending.task.title}” moves to in progress.`
                    : `“${pending.task.title}” goes to your Mentor for review.`}
                </DialogDescription>
              </DialogHeader>
              <label className="block space-y-1.5 text-sm font-medium">
                Progress note <span className="font-normal text-muted-foreground">(optional, visible to your Mentor)</span>
                <Textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} disabled={update.isPending} />
              </label>
              {update.isError && <p role="alert" className="text-sm text-destructive">{update.error.message}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={update.isPending}>Back</Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                  {pending.status === 'IN_PROGRESS' ? 'Start task' : 'Mark completed'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <WithdrawDialog
        task={withdrawTarget}
        pending={withdraw.isPending}
        error={withdraw.isError ? withdraw.error.message : null}
        onCancel={() => setWithdrawTarget(null)}
        onConfirm={() => void confirmWithdraw()}
      />
    </div>
  );
}

function WithdrawDialog({
  task,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  task: InternTask | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={task !== null} onOpenChange={(isOpen) => { if (!isOpen && !pending) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        {task && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Withdraw this submission?</DialogTitle>
              <DialogDescription>
                Your task will return to In Progress, and you can correct your work and submit it again. You can
                withdraw only before the due date and before your Mentor reviews the submission.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm font-medium">{task.title}</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
              <Button type="button" onClick={onConfirm} disabled={pending} aria-busy={pending}>
                {pending && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                {pending ? 'Withdrawing…' : 'Withdraw submission'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
