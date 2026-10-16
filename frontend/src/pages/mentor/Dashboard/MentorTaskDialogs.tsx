import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';

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
import {
  cancelMentorTask,
  reviewMentorTask,
  updateMentorTask,
} from '@/features/intern/services/intern-tasks.service';
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@/features/intern/task-labels';
import type { InternTask, InternTaskPriority } from '@/features/intern/types';

export type TaskDialog = { kind: 'edit' | 'cancel' | 'review'; task: InternTask } | null;

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function ErrorMessage({ message }: { message: string }) {
  return <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>;
}

// Edit, cancel and review dialogs for one task. The server re-checks the
// Mentor's assignment and the task state for every action.
export default function MentorTaskDialogs({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: TaskDialog;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={dialog !== null} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {dialog?.kind === 'edit' && <EditForm key={dialog.task.id} task={dialog.task} onClose={onClose} onSaved={onSaved} />}
        {dialog?.kind === 'cancel' && <CancelForm key={dialog.task.id} task={dialog.task} onClose={onClose} onSaved={onSaved} />}
        {dialog?.kind === 'review' && <ReviewForm key={dialog.task.id} task={dialog.task} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  task: InternTask;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function EditForm({ task, onClose, onSaved }: FormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [priority, setPriority] = useState<InternTaskPriority>(task.priority);
  const save = useMutation({
    mutationFn: () => updateMentorTask(task.id, {
      title: title.trim(), description: description.trim() || null, dueDate: dueDate || null, priority,
    }),
    onSuccess: async () => { await onSaved(); onClose(); },
  });

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !save.isPending) save.mutate(); }}>
      <DialogHeader>
        <DialogTitle>Edit task</DialogTitle>
        <DialogDescription>Changes are visible to the intern and kept in the task history.</DialogDescription>
      </DialogHeader>
      <label className="block space-y-1.5 text-sm font-medium">Title <span className="text-destructive">*</span>
        <Input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={save.isPending} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">Description
        <Textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={save.isPending} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">Due date
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={save.isPending} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">Priority
          <select className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value as InternTaskPriority)} disabled={save.isPending}>
            {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{TASK_PRIORITY_LABELS[value]}</option>)}
          </select>
        </label>
      </div>
      {save.isError && <ErrorMessage message={save.error.message} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Save changes</Button>
      </DialogFooter>
    </form>
  );
}

function CancelForm({ task, onClose, onSaved }: FormProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelMentorTask(task.id, reason.trim()),
    onSuccess: async () => { await onSaved(); onClose(); },
  });
  const missing = reason.trim() === '';

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setTouched(true); if (!missing && !cancel.isPending) cancel.mutate(); }}>
      <DialogHeader>
        <DialogTitle>Cancel “{task.title}”?</DialogTitle>
        <DialogDescription>The intern sees the task as cancelled with your reason. This cannot be undone.</DialogDescription>
      </DialogHeader>
      <label className="block space-y-1.5 text-sm font-medium">Reason <span className="text-destructive">*</span>
        <Textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={touched && missing} disabled={cancel.isPending} />
        {touched && missing && <span className="block text-xs font-normal text-destructive">A reason is required.</span>}
      </label>
      {cancel.isError && <ErrorMessage message={cancel.error.message} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={cancel.isPending}>Back</Button>
        <Button type="submit" variant="destructive" disabled={cancel.isPending}>{cancel.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Cancel task</Button>
      </DialogFooter>
    </form>
  );
}

function ReviewForm({ task, onClose, onSaved }: FormProps) {
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState<'ACCEPT' | 'REQUEST_CHANGES' | null>(null);
  const review = useMutation({
    mutationFn: (choice: 'ACCEPT' | 'REQUEST_CHANGES') => reviewMentorTask(task.id, choice, feedback.trim() || null),
    onSuccess: async () => { await onSaved(); onClose(); },
    // E.g. the intern withdrew the submission meanwhile: show the current state.
    onError: () => { void onSaved(); },
  });
  const feedbackMissing = decision === 'REQUEST_CHANGES' && feedback.trim() === '';

  function submit(choice: 'ACCEPT' | 'REQUEST_CHANGES') {
    setDecision(choice);
    if (choice === 'REQUEST_CHANGES' && feedback.trim() === '') return;
    if (!review.isPending) review.mutate(choice);
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Review “{task.title}”</DialogTitle>
        <DialogDescription>
          Accept the completed work, or send it back with what should change. The intern sees your feedback.
        </DialogDescription>
      </DialogHeader>
      <label className="block space-y-1.5 text-sm font-medium">Feedback
        <span className="font-normal text-muted-foreground"> (required when requesting changes)</span>
        <Textarea rows={3} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} aria-invalid={feedbackMissing} disabled={review.isPending} />
        {feedbackMissing && <span className="block text-xs font-normal text-destructive">Explain what should change.</span>}
      </label>
      {review.isError && <ErrorMessage message={review.error.message} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={review.isPending}>Back</Button>
        <Button type="button" variant="outline" onClick={() => submit('REQUEST_CHANGES')} disabled={review.isPending}>Request changes</Button>
        <Button type="button" onClick={() => submit('ACCEPT')} disabled={review.isPending}>
          {review.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Accept
        </Button>
      </DialogFooter>
    </div>
  );
}
