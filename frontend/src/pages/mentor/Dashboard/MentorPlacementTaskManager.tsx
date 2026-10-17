import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, History, LoaderCircle, RotateCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createMentorPlacementTask,
  getMentorPlacementTasks,
  getMentorTaskEvents,
} from '@/features/intern/services/intern-tasks.service';
import {
  isTaskOverdue,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  taskStateLabel,
} from '@/features/intern/task-labels';
import type { InternTask, InternTaskEvent, InternTaskPriority } from '@/features/intern/types';

import MentorTaskDialogs, { type TaskDialog } from './MentorTaskDialogs';

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

// Awaiting review first, then open work by due date, then finished work.
function sortRank(task: InternTask) {
  if (task.status === 'COMPLETED' && task.reviewStatus === null) return 0;
  if (task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS') return 1;
  if (task.status === 'COMPLETED') return 2;
  return 3;
}

// readOnly: a completed placement's history. No create, edit, cancel or review
// control is rendered; the database refuses those writes for any non-active
// placement as well.
export default function MentorPlacementTaskManager({ placementId, readOnly = false }: { placementId: string; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const tasksKey = ['mentor', 'placement-tasks', placementId];
  const eventsKey = ['mentor', 'placement-task-events', placementId];
  const tasks = useQuery({ queryKey: tasksKey, queryFn: () => getMentorPlacementTasks(placementId), retry: false });
  const events = useQuery({ queryKey: eventsKey, queryFn: () => getMentorTaskEvents(placementId), retry: false });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<InternTaskPriority>('MEDIUM');
  const [dialog, setDialog] = useState<TaskDialog>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksKey }),
      queryClient.invalidateQueries({ queryKey: eventsKey }),
      queryClient.invalidateQueries({ queryKey: ['mentor', 'placements'] }),
    ]);
  }

  const create = useMutation({
    mutationFn: () => createMentorPlacementTask(placementId, {
      title: title.trim(), description: description.trim() || null, dueDate: dueDate || null, priority,
    }),
    onSuccess: async () => {
      setTitle(''); setDescription(''); setDueDate(''); setPriority('MEDIUM');
      await refresh();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!readOnly && !create.isPending && title.trim()) create.mutate();
  }

  const sorted = [...(tasks.data ?? [])].sort((a, b) =>
    sortRank(a) - sortRank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  return (
    <section className="space-y-4 border-t pt-5">
      <div>
        <h3 className="font-semibold">Tasks</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? 'Tasks and their history from this completed placement. They can no longer be changed.'
            : 'Assign work, review what the intern completes, and give feedback. The intern updates progress from their portal.'}
        </p>
      </div>

      {!readOnly && (
      <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
        <label className="space-y-2 text-sm font-medium md:col-span-3">New task title
          <Input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={create.isPending} />
        </label>
        <label className="space-y-2 text-sm font-medium md:col-span-3">Description <span className="font-normal text-muted-foreground">(optional)</span>
          <Textarea maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={create.isPending} rows={2} />
        </label>
        <label className="space-y-2 text-sm font-medium">Due date <span className="font-normal text-muted-foreground">(optional)</span>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={create.isPending} />
        </label>
        <label className="space-y-2 text-sm font-medium">Priority
          <select className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as InternTaskPriority)} disabled={create.isPending}>
            {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}{create.isPending ? 'Assigning…' : 'Assign task'}
          </Button>
        </div>
        {create.isError && <p role="alert" className="text-sm text-destructive md:col-span-3">{create.error.message}</p>}
      </form>
      )}

      {tasks.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading tasks…</p>
      ) : tasks.isError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
          <span className="flex-1">{tasks.error.message}</span>
          <Button type="button" variant="outline" onClick={() => void tasks.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><ClipboardList className="size-4" />{readOnly ? 'No tasks were assigned during this placement.' : 'No tasks assigned yet.'}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((task) => {
            const awaitingReview = task.status === 'COMPLETED' && task.reviewStatus === null;
            const open = task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS';
            return (
              <li key={task.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className={`font-medium ${task.status === 'CANCELLED' ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p>
                    {task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {TASK_PRIORITY_LABELS[task.priority]} priority
                      {task.dueDate && <> · Due {task.dueDate}</>}
                      {isTaskOverdue(task) && <span className="font-medium text-destructive"> · Overdue</span>}
                    </p>
                  </div>
                  <Badge variant={awaitingReview ? 'default' : 'outline'} className="w-fit shrink-0">{taskStateLabel(task)}</Badge>
                </div>
                {task.mentorFeedback && <p className="rounded-md bg-muted/50 p-2 text-sm"><span className="font-medium">Your feedback:</span> {task.mentorFeedback}</p>}
                {task.cancellationReason && <p className="text-sm text-muted-foreground">Cancelled: {task.cancellationReason}</p>}
                <div className="flex flex-wrap gap-2">
                  {!readOnly && awaitingReview && <Button size="sm" onClick={() => setDialog({ kind: 'review', task })}>Review</Button>}
                  {!readOnly && open && <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'edit', task })}>Edit</Button>}
                  {!readOnly && open && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'cancel', task })}>Cancel task</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setHistoryFor(historyFor === task.id ? null : task.id)}>
                    <History className="mr-1 size-4" />{historyFor === task.id ? 'Hide history' : 'History'}
                  </Button>
                </div>
                {historyFor === task.id && (
                  <TaskHistory
                    events={(events.data ?? []).filter((event) => event.taskId === task.id)}
                    loading={events.isPending}
                    error={events.isError ? events.error.message : null}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && <MentorTaskDialogs dialog={dialog} onClose={() => setDialog(null)} onSaved={refresh} />}
    </section>
  );
}

const EVENT_LABELS: Record<InternTaskEvent['type'], string> = {
  CREATED: 'Task assigned',
  UPDATED: 'Task edited',
  STARTED: 'Intern started the task',
  SUBMITTED: 'Intern marked it completed',
  ACCEPTED: 'Accepted',
  CHANGES_REQUESTED: 'Changes requested',
  CANCELLED: 'Cancelled',
  WITHDRAWN: 'Intern withdrew the submission',
};

function TaskHistory({ events, loading, error }: { events: InternTaskEvent[]; loading: boolean; error: string | null }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No recorded history for this task.</p>;
  return (
    <ol className="ml-1 space-y-2 border-l pl-4 text-sm">
      {events.map((event) => (
        <li key={event.id}>
          <p className="font-medium">{EVENT_LABELS[event.type] ?? event.type}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleString()} · {event.actorName ?? 'Unknown'}
          </p>
          {event.note && <p className="whitespace-pre-wrap text-muted-foreground">{event.note}</p>}
        </li>
      ))}
    </ol>
  );
}
