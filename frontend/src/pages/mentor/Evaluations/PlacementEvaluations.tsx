import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, HardDrive, LoaderCircle, Plus, RotateCw } from 'lucide-react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
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
import { useAuth } from '@/features/auth/auth-context';
import { EvaluationRequestError, listMentorEvaluations } from '@/features/evaluations/evaluations.service';
import { listBackups, newClientDraftId } from '@/features/evaluations/local-backup';
import { evaluationQueryKeys, isAccessError } from '@/features/evaluations/query-keys';
import { errorMessage, evaluationStateLabel, formatDateTime } from '@/features/evaluations/messages';
import type { MentorEvaluation } from '@/features/evaluations/types';
import { getMyMentorPlacements } from '@/features/mentor/services/mentor-placements.service';
import { getSignedInUserId } from '@/lib/auth-identity';
import EvaluationEditor from './EvaluationEditor';
import LocalCopiesPanel from './LocalCopiesPanel';

// draftId identifies the local copy of a new evaluation (see local-backup.ts).
type Selection = { key: number; id: string | 'new' | null; draftId: string };
type Target = { id: string } | { newDraftId: string };

// Evaluations of one placement: a list and one editor. Unsaved text is guarded
// when leaving the page, reloading, or switching to another evaluation, and a
// local copy (this tab only) lets the Mentor recover it after the editor was
// closed, for example when the session ended.
export default function PlacementEvaluations() {
  const { placementId = '' } = useParams();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();
  const placements = useQuery({
    queryKey: evaluationQueryKeys.mentorPlacements(userId),
    queryFn: getMyMentorPlacements,
    retry: false,
    enabled: userId !== '',
  });
  const evaluations = useQuery({
    queryKey: evaluationQueryKeys.mentorEvaluations(userId, placementId),
    queryFn: () => listMentorEvaluations(placementId),
    retry: false,
    enabled: userId !== '',
  });
  // Data kept from an earlier fetch is never shown once the server refused
  // access (403/404, or the session ended); other failed reloads keep the
  // list and the editor (and its unsaved text) on screen.
  const accessLost = evaluations.isError && isAccessError(evaluations.error);
  const list = accessLost ? undefined : evaluations.data;
  const placement = placements.isError ? undefined : placements.data?.find((p) => p.placementId === placementId);
  const placementStatus = placement?.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED';
  const canWrite = placement?.status === 'ACTIVE';

  const [selection, setSelection] = useState<Selection>(() => ({ key: 0, id: null, draftId: newClientDraftId() }));
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBackedUp, setEditorBackedUp] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<Target | null>(null);

  // Local copies of this Mentor's unsaved text for this placement (re-read
  // whenever the editor's state changes). New drafts stay reachable after the
  // placement was completed, read-only, so they can be copied or discarded.
  const backups = userId ? listBackups(userId).filter((backup) => backup.placementId === placementId) : [];
  const canRecoverDrafts = canWrite || placement?.status === 'COMPLETED';
  const backedUpIds = new Set(backups.flatMap((backup) => (backup.evaluationId ? [backup.evaluationId] : [])));
  const newDraftBackups = backups
    .filter((backup) => backup.clientDraftId !== null && !(selection.id === 'new' && backup.clientDraftId === selection.draftId))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  // The editor is shown only while the list is available (it closes after a
  // 401/403/404; its local copy stays). Its last unsaved state only counts
  // while it is shown, so a closed editor leaves no leave warning behind.
  const editorShown = selection.id !== null && userId !== '' && list !== undefined;
  const unsavedShown = editorDirty && editorShown;

  // Leaving the page with unsaved text (or a request in progress) asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    unsavedShown && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!unsavedShown) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the warning only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedShown]);

  function select(target: Target) {
    setEditorDirty(false);
    setEditorBackedUp(false);
    setSelection((current) => ('id' in target
      ? { key: current.key + 1, id: target.id, draftId: newClientDraftId() }
      : { key: current.key + 1, id: 'new', draftId: target.newDraftId }));
  }

  // Switching never deletes a local copy; discarding is a separate, explicit
  // action in the editor.
  function open(target: Target) {
    if ('id' in target ? target.id === selection.id : selection.id === 'new' && target.newDraftId === selection.draftId) return;
    if (unsavedShown) {
      setPendingSwitch(target);
      return;
    }
    select(target);
  }

  function confirmSwitch() {
    if (pendingSwitch === null) return;
    select(pendingSwitch);
    setPendingSwitch(null);
  }

  // A confirmed write: update the list without remounting the editor (the
  // Mentor may have typed more while the request was in flight). Only the
  // editor that is still shown may change the selection: a request of an
  // editor the Mentor already left can complete late.
  const onConfirmed = useCallback((evaluation: MentorEvaluation, editorKey: number) => {
    // A late answer after a sign-out or account switch belongs to the previous
    // user: it must not touch the cache or the page.
    if (getSignedInUserId() !== userId) return;
    queryClient.setQueryData<MentorEvaluation[]>(evaluationQueryKeys.mentorEvaluations(userId, placementId), (rows) => {
      if (!rows) return rows;
      return rows.some((row) => row.id === evaluation.id)
        ? rows.map((row) => (row.id === evaluation.id ? evaluation : row))
        : [...rows, evaluation];
    });
    setSelection((current) => (current.key === editorKey ? { ...current, id: evaluation.id } : current));
  }, [placementId, queryClient, userId]);

  // After an unknown create outcome: a fresh list (awaited), so the editor can
  // recognise its create by its key before saying anything definite.
  const onCreateUncertain = useCallback(async () => {
    try {
      return await queryClient.fetchQuery({
        queryKey: evaluationQueryKeys.mentorEvaluations(userId, placementId),
        queryFn: () => listMentorEvaluations(placementId),
        staleTime: 0,
        retry: false,
      });
    } catch {
      return undefined;
    }
  }, [placementId, queryClient, userId]);

  // The server reported that the placement changed (completed, reassigned):
  // refresh what this page shows. The server stays authoritative.
  const onStaleState = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: evaluationQueryKeys.mentorPlacements(userId) });
    void queryClient.invalidateQueries({ queryKey: evaluationQueryKeys.mentorEvaluations(userId, placementId) });
  }, [placementId, queryClient, userId]);

  const selected = selection.id && selection.id !== 'new'
    ? list?.find((row) => row.id === selection.id) ?? null
    : null;
  const showEditor = selection.id !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
      <header className="space-y-2">
        <Link to="/mentor/evaluations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" />All placements
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Evaluations{placement?.internName ? ` — ${placement.internName}` : ''}
        </h1>
        {placement && (
          <p className="text-sm text-muted-foreground">
            {placement.trainingTitle} · {placement.company} · {placement.status === 'ACTIVE' ? 'Active placement' : 'Completed placement (read-only)'}
          </p>
        )}
      </header>

      {/* A failed background reload keeps the list and the editor (and its unsaved text) on screen. */}
      {evaluations.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {evaluations.error instanceof EvaluationRequestError && evaluations.error.outcome === 'not-applied'
            ? errorMessage(evaluations.error.code)
            : 'The evaluations could not be loaded.'}
          <Button type="button" variant="outline" size="sm" onClick={() => void evaluations.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </div>
      )}

      {list === undefined ? (
        evaluations.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading evaluations…</p>
        ) : accessLost && userId ? (
          <LocalCopiesPanel userId={userId} placementId={placementId} />
        ) : null
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Evaluations of this placement" className="space-y-2">
            {canWrite && (
              <Button type="button" className="w-full" onClick={() => open({ newDraftId: newClientDraftId() })}>
                <Plus className="mr-2 size-4" />New evaluation
              </Button>
            )}
            {canRecoverDrafts && newDraftBackups.map((backup) => (
              <button
                key={backup.clientDraftId}
                type="button"
                onClick={() => open({ newDraftId: backup.clientDraftId as string })}
                className="w-full rounded-lg border border-dashed border-amber-500/50 p-3 text-start text-sm hover:bg-muted"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <HardDrive className="size-4" />Unsaved new evaluation{canWrite ? '' : ' (read-only: placement completed)'}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Local copy in this browser tab only, not saved on the server ({formatDateTime(backup.updatedAt)})
                </span>
              </button>
            ))}
            {list.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No evaluations yet.</p>
            ) : (
              list.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => open({ id: row.id })}
                  aria-current={row.id === selection.id ? 'true' : undefined}
                  className={`w-full rounded-lg border p-3 text-start text-sm hover:bg-muted ${row.id === selection.id ? 'border-primary bg-muted' : ''}`}
                >
                  <span className="block font-medium">Evaluation {index + 1}</span>
                  <span className="block text-xs text-muted-foreground">Created {formatDateTime(row.createdAt)}</span>
                  <Badge variant="secondary" className="mt-2">{evaluationStateLabel(row.publicationState, row.placementStatus)}</Badge>
                  {backedUpIds.has(row.id) && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <HardDrive className="size-3.5" />Unsaved local text in this tab
                    </span>
                  )}
                </button>
              ))
            )}
          </nav>

          <Card>
            <CardContent className="p-5">
              {showEditor && userId ? (
                <EvaluationEditor
                  key={selection.key}
                  userId={userId}
                  clientDraftId={selection.draftId}
                  placementId={placementId}
                  placementStatus={selected?.placementStatus ?? placementStatus}
                  initial={selection.id === 'new' ? null : selected}
                  onConfirmed={(evaluation) => onConfirmed(evaluation, selection.key)}
                  onCreateUncertain={onCreateUncertain}
                  onStaleState={onStaleState}
                  onDraftIdChange={(draftId) => setSelection((current) => (
                    current.id === 'new' && current.key === selection.key ? { ...current, draftId } : current))}
                  onDirtyChange={setEditorDirty}
                  onBackupChange={setEditorBackedUp}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {canWrite ? 'Select an evaluation or start a new one.' : 'Select an evaluation to read it.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={pendingSwitch !== null} onOpenChange={(isOpen) => { if (!isOpen) setPendingSwitch(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch with unsaved changes?</DialogTitle>
            <DialogDescription>{leaveDescription(editorBackedUp)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingSwitch(null)}>Stay</Button>
            <Button type="button" variant={editorBackedUp ? 'default' : 'destructive'} onClick={confirmSwitch}>
              {editorBackedUp ? 'Switch (keep local copy)' : 'Switch and lose the text'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(isOpen) => { if (!isOpen && blocker.state === 'blocked') blocker.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>{leaveDescription(editorBackedUp)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.state === 'blocked' && blocker.reset()}>Stay</Button>
            <Button type="button" variant={editorBackedUp ? 'default' : 'destructive'} onClick={() => blocker.state === 'blocked' && blocker.proceed()}>
              {editorBackedUp ? 'Leave (keep local copy)' : 'Leave and lose the text'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function leaveDescription(backedUp: boolean): string {
  return backedUp
    ? 'Your unsaved text has not been saved on the server. A temporary copy is kept in this browser tab only; reopen this evaluation in this tab to recover it. Closing the tab removes it.'
    : 'Your evaluation has unsaved changes or a request in progress, and there is no local copy of unsaved text. Unsaved text is lost if you continue.';
}
