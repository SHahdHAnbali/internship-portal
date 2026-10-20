import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Eye, HardDrive, LoaderCircle, Lock, Save, Send, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { contentProblem, countCodePoints, EVALUATION_MAX_CODE_POINTS, isBlank } from '@/features/evaluations/content-rules';
import { errorMessage, evaluationStateLabel, formatDateTime } from '@/features/evaluations/messages';
import type { EvaluationPlacementStatus, MentorEvaluation } from '@/features/evaluations/types';
import { useEvaluationEditor } from '@/features/evaluations/useEvaluationEditor';

interface Props {
  // The signed-in Mentor (scopes the local copy of unsaved text).
  userId: string;
  // Identifies the local copy of a new evaluation that has no server id yet.
  clientDraftId: string;
  placementId: string;
  placementStatus: EvaluationPlacementStatus;
  initial: MentorEvaluation | null;
  onConfirmed?: (evaluation: MentorEvaluation) => void;
  onCreateUncertain?: () => Promise<MentorEvaluation[] | undefined>;
  onStaleState?: () => void;
  onDraftIdChange?: (draftId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  // Whether the unsaved text currently has a local copy in this tab.
  onBackupChange?: (kept: boolean) => void;
}

// One evaluation: a single free-text field. The Mentor saves drafts and
// publishes explicitly; the intern only ever sees the published version.
export default function EvaluationEditor({
  userId, clientDraftId, placementId, placementStatus, initial, onConfirmed, onCreateUncertain, onStaleState, onDraftIdChange,
  onDirtyChange, onBackupChange,
}: Props) {
  const editor = useEvaluationEditor({
    userId, placementId, initial, clientDraftId, placementReadOnly: placementStatus === 'COMPLETED', onConfirmed, onCreateUncertain,
    onStaleState, onDraftIdChange,
  });
  const { baseline, local, phase, dirty, busy } = editor;
  const readOnly = editor.readOnly;
  const count = countCodePoints(local);
  const problem = contentProblem(local);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmNewKey, setConfirmNewKey] = useState(false);

  useEffect(() => {
    onDirtyChange?.(dirty || busy);
  }, [dirty, busy, onDirtyChange]);

  useEffect(() => {
    onBackupChange?.(editor.backupStatus === 'kept');
  }, [editor.backupStatus, onBackupChange]);

  async function copyMyText() {
    try {
      await navigator.clipboard.writeText(local);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  const statusLabel = baseline
    ? evaluationStateLabel(baseline.publicationState, baseline.placementStatus)
    : 'New evaluation — not saved yet';

  return (
    <section className="space-y-4" aria-label="Evaluation editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={baseline?.publicationState === 'PUBLISHED' ? 'default' : 'secondary'}>{statusLabel}</Badge>
          <SaveState phase={phase.name === 'pending' ? phase.attempt.kind : phase.name === 'succeeded' ? `done-${phase.kind}` : null} dirty={dirty} />
        </div>
        {baseline && (
          <p className="text-xs text-muted-foreground">
            Written by {baseline.authorName ?? 'a Mentor'} · last saved {formatDateTime(baseline.updatedAt)}
            {baseline.lastEditorName && baseline.lastEditorName !== baseline.authorName ? ` by ${baseline.lastEditorName}` : ''}
          </p>
        )}
      </div>

      {editor.recovered && (
        <div role="status" className="space-y-1 rounded-lg border border-amber-500/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><HardDrive className="size-4" />Recovered local, unsaved text</p>
          <p className="text-muted-foreground">
            This text was kept only in this browser tab and has <strong>not been saved</strong> on the server.
            {readOnly
              ? 'The placement is completed, so it cannot be saved or published. Copy it if you need it, or discard it.'
              : 'Review it, then save it as a draft, or discard it.'}
          </p>
          {readOnly && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={() => void copyMyText()}><Copy className="mr-2 size-4" />Copy text</Button>
              {copyState === 'copied' && <span className="text-xs text-muted-foreground">Copied.</span>}
              {copyState === 'failed' && <span className="text-xs text-destructive">Copying failed. Select the text and copy it manually.</span>}
            </div>
          )}
        </div>
      )}

      {readOnly && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <Lock className="size-4" />This placement is completed. Its evaluations are read-only.
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="evaluation-text" className="text-sm font-medium">Evaluation</label>
        <Textarea
          id="evaluation-text"
          dir="auto"
          value={local}
          readOnly={readOnly}
          onChange={(event) => editor.setLocal(event.target.value)}
          rows={16}
          className="min-h-80 whitespace-pre-wrap text-base leading-7"
          placeholder={readOnly ? undefined : 'Write the evaluation in your own words.'}
          aria-invalid={problem !== null}
          aria-describedby="evaluation-count"
        />
        <p id="evaluation-count" className={`text-xs ${problem ? 'text-destructive' : 'text-muted-foreground'}`}>
          {count.toLocaleString()} / {EVALUATION_MAX_CODE_POINTS.toLocaleString()} characters
          {problem ? ` — ${errorMessage(problem)}` : ' (emoji and accent marks can count as more than one)'}
        </p>
        {editor.backupStatus === 'kept' && (
          <p className="text-xs text-muted-foreground">
            A temporary copy of your unsaved text is kept in this browser tab only (not on the server) until it is saved or discarded.
          </p>
        )}
        {editor.backupStatus === 'unavailable' && (
          <p role="alert" className="text-xs text-destructive">
            This browser did not allow a temporary local copy of your unsaved text. Save it before leaving this page.
          </p>
        )}
      </div>

      {editor.serverDiffers && baseline && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          The saved text differs from what is in the editor. Your text was kept.
          <Button type="button" size="sm" variant="outline" onClick={editor.applySavedVersion}>Use saved version</Button>
        </div>
      )}

      {editor.legacyDraftKey && !readOnly && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
          <p>
            This unsaved draft was kept by an older version of the portal and cannot be saved as it is. Your text is kept.
            First check the list of evaluations: if this text is already there, it was saved before, and saving it again would
            create a second evaluation.
          </p>
          {confirmNewKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Prepare this text to be saved as a new draft?</span>
              <Button type="button" size="sm" onClick={() => { setConfirmNewKey(false); editor.startNewDraftKey(); }}>
                Yes, as a new draft
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmNewKey(false)}>Cancel</Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmNewKey(true)}>Save as a new draft…</Button>
          )}
        </div>
      )}

      {phase.name === 'adopted' && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          This draft had already been saved by an earlier attempt, so no second copy was created. Your current text is
          kept in the editor and is not saved yet: press Save draft to save it.
        </p>
      )}

      {phase.name === 'failed' && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage(phase.code)} Your text is still in the editor.</span>
        </p>
      )}

      {phase.name === 'uncertain' && (
        <UncertainOutcome
          kind={phase.attempt.kind}
          checking={phase.checking}
          checkResult={phase.checkResult}
          serverRevision={editor.latest?.revision}
          onCheck={() => void editor.checkOutcome()}
          onRetry={editor.retry}
          onDismiss={editor.dismissPhase}
        />
      )}

      {dirty && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmDiscard ? (
            <>
              <span className="text-sm">Discard your unsaved text{baseline ? ' and show the saved version' : ''}? This cannot be undone.</span>
              <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => { setConfirmDiscard(false); editor.discardLocalText(); }}>Yes, discard</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>Cancel</Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              <Trash2 className="mr-2 size-4" />Discard unsaved text
            </Button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={editor.save} disabled={busy || !dirty || problem !== null || editor.legacyDraftKey}>
            {phase.name === 'pending' && phase.attempt.kind !== 'publish' ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Save draft
          </Button>
          <Button type="button" variant="outline" onClick={() => setConfirmPublish(true)} disabled={!editor.canPublish}>
            <Send className="mr-2 size-4" />{baseline?.published ? 'Republish' : 'Publish'}
          </Button>
          <PublishHint dirty={dirty} baseline={baseline} />
        </div>
      )}

      {baseline?.published && (
        <section className="space-y-2 rounded-lg border bg-muted/30 p-4" aria-label="Published version">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Eye className="size-4" />Published version — what the intern sees</h3>
          <p className="text-xs text-muted-foreground">
            Published {formatDateTime(baseline.published.publishedAt)}
            {baseline.published.publishedByName ? ` by ${baseline.published.publishedByName}` : ''}
          </p>
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-6">{baseline.published.content}</p>
        </section>
      )}

      <Dialog open={confirmPublish} onOpenChange={(open) => { if (!open) setConfirmPublish(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{baseline?.published ? 'Republish this evaluation?' : 'Publish this evaluation?'}</DialogTitle>
            <DialogDescription>
              The intern will see the saved text exactly as it is now. Later changes stay private until you publish again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmPublish(false)}>Cancel</Button>
            <Button type="button" disabled={!editor.canPublish} onClick={() => { setConfirmPublish(false); editor.publish(); }}>
              {baseline?.published ? 'Republish' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={phase.name === 'conflict'} onOpenChange={(open) => { if (!open) { setConfirmReplace(false); editor.keepEditing(); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>This evaluation was changed elsewhere</DialogTitle>
            <DialogDescription>
              {phase.name === 'conflict' && phase.source === 'recovery'
                ? `Your recovered local text was based on revision ${phase.attempt.kind === 'create' ? '' : phase.attempt.expectedRevision}, but the evaluation has changed since then${phase.currentRevision ? ` (revision ${phase.currentRevision})` : ''}. Your text is in the editor and has not been saved.`
                : `Your ${phase.name === 'conflict' && phase.attempt.kind === 'publish' ? 'publication' : 'changes'} were not applied because a newer version exists${phase.name === 'conflict' && phase.currentRevision ? ` (revision ${phase.currentRevision})` : ''}. Your text is still in the editor.`}
              {' '}Choose what to do.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyMyText()}><Copy className="mr-2 size-4" />Copy my text</Button>
            <Button type="button" variant="outline" onClick={() => void editor.viewLatest()}><Eye className="mr-2 size-4" />View latest</Button>
          </div>
          {copyState === 'copied' && <p role="status" className="text-sm text-muted-foreground">Your text was copied.</p>}
          {copyState === 'failed' && <p role="alert" className="text-sm text-destructive">Copying failed. Select the text in the editor and copy it manually.</p>}
          {editor.latestError !== undefined && <p role="alert" className="text-sm text-destructive">{errorMessage(editor.latestError)}</p>}
          {editor.latest && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Latest saved version (revision {editor.latest.revision}, {formatDateTime(editor.latest.updatedAt)})
              </p>
              <p dir="auto" className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{editor.latest.content}</p>
              {confirmReplace ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Replace your text with this version? Your unsaved text will be lost.</span>
                  <Button type="button" variant="destructive" onClick={() => { setConfirmReplace(false); editor.replaceWithLatest(); }}>Yes, replace my text</Button>
                  <Button type="button" variant="outline" onClick={() => setConfirmReplace(false)}>No</Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfirmReplace(true)}>Replace my text</Button>
                  <Button type="button" variant="outline" onClick={editor.keepMyTextOnLatest}>Keep my text and save it over this version</Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => { setConfirmReplace(false); editor.keepEditing(); }}>Keep editing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SaveState({ phase, dirty }: { phase: string | null; dirty: boolean }) {
  if (phase === 'save' || phase === 'create') return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (phase === 'publish') return <span className="text-xs text-muted-foreground">Publishing…</span>;
  if (dirty) return <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</span>;
  if (phase === 'done-publish') return <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />Published</span>;
  if (phase === 'done-save' || phase === 'done-create') return <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />Saved</span>;
  return null;
}

function PublishHint({ dirty, baseline }: { dirty: boolean; baseline: MentorEvaluation | null }) {
  let hint: string | null = null;
  if (!baseline) hint = 'Save the draft before publishing.';
  else if (dirty) hint = 'Save your changes before publishing.';
  else if (isBlank(baseline.content)) hint = 'Write the evaluation before publishing.';
  else if (baseline.publicationState === 'PUBLISHED') hint = 'The saved text is already published.';
  return hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null;
}

function UncertainOutcome({ kind, checking, checkResult, serverRevision, onCheck, onRetry, onDismiss }: {
  kind: 'create' | 'save' | 'publish';
  checking: boolean;
  checkResult: 'none' | 'unconfirmed' | 'not-in-list';
  serverRevision: number | undefined;
  onCheck: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const what = kind === 'publish' ? 'published' : kind === 'create' ? 'created' : 'saved';
  const checked = checkResult !== 'none';
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-amber-500/40 p-3 text-sm">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <span>
          We couldn’t confirm whether the evaluation was {what}. Your text is still in the editor and nothing was retried.
          {kind === 'create' && !checked && ' Trying again is safe: this draft can never be created twice.'}
          {checkResult === 'not-in-list'
            && ' The list was refreshed and this draft is not in it yet. Trying again is safe: it can never create a second copy.'}
          {checkResult === 'unconfirmed' && (kind === 'create'
            ? ' The list could not be refreshed. Trying again is safe: it can never create a second copy.'
            : ` The outcome is still unconfirmed${serverRevision ? ` (the server shows revision ${serverRevision})` : ''}.`)}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCheck} disabled={checking}>
          {checking && <LoaderCircle className="mr-2 size-4 animate-spin" />}
          {kind === 'create' ? 'Refresh the list' : 'Check whether it was ' + what}
        </Button>
        {(checked || kind === 'create') && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={checking}>Try again</Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </div>
    </div>
  );
}
