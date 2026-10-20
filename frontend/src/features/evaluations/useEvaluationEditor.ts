import { useCallback, useEffect, useRef, useState } from 'react';

import { contentProblem, isBlank } from './content-rules';
import {
  EvaluationRequestError,
  createMentorEvaluation,
  getMentorEvaluation,
  publishMentorEvaluation,
  saveMentorEvaluation,
} from './evaluations.service';
import {
  backupKey, isClientRequestKey, newClientDraftId, onBackupRemoved, readBackup, removeBackup, writeBackup, type BackupTarget,
} from './local-backup';
import type { MentorEvaluation } from './types';

// One write the user asked for, exactly as sent (body and expected revision).
// A retry resends this object unchanged; it never picks up newer local text
// or a newer revision on its own.
// A create carries its operation's idempotency key (the draft's client id):
// the same key for every retry and recovery, so it can never create twice.
export type EvaluationAttempt =
  | { kind: 'create'; placementId: string; clientRequestId: string; content: string }
  | { kind: 'save'; evaluationId: string; expectedRevision: number; content: string }
  | { kind: 'publish'; evaluationId: string; expectedRevision: number; content: string };

export type EditorPhase =
  | { name: 'idle' }
  | { name: 'pending'; attempt: EvaluationAttempt }
  | { name: 'succeeded'; kind: EvaluationAttempt['kind'] }
  // An earlier request of this create operation had already created the
  // evaluation: the editor now works on it; the local text is kept (unsaved).
  | { name: 'adopted' }
  // The server answered with an error: nothing was changed.
  | { name: 'failed'; attempt: EvaluationAttempt; code: string | undefined }
  // A newer revision exists: after a refused write, or when recovered local
  // text was based on an older revision (source 'recovery', nothing was sent).
  | { name: 'conflict'; attempt: EvaluationAttempt; currentRevision: number | undefined; source?: 'recovery' }
  // No trustworthy answer: the write may or may not have happened.
  // checkResult: 'unconfirmed' (the check itself failed or was inconclusive),
  // 'not-in-list' (a create: the list was refreshed and does not contain it).
  | { name: 'uncertain'; attempt: EvaluationAttempt; checking: boolean; checkResult: 'none' | 'unconfirmed' | 'not-in-list' };

// Answers meaning the page's view of the placement is out of date (completed,
// reassigned, no longer accessible): the page refreshes it.
const STALE_STATE_CODES = new Set(['PLACEMENT_NOT_ACTIVE', 'PLACEMENT_NOT_FOUND', 'EVALUATION_NOT_FOUND', 'EVALUATION_ACCESS_DENIED']);

// 'kept': the unsaved text has a local copy in this tab. 'unavailable': it
// could not be stored (storage blocked or full).
export type BackupStatus = 'none' | 'kept' | 'unavailable';

interface Options {
  userId: string;
  placementId: string;
  initial: MentorEvaluation | null;
  // Identifies a new (not yet created) evaluation's local copy.
  clientDraftId: string;
  // The placement no longer accepts writes (completed): nothing is sent.
  placementReadOnly?: boolean;
  onConfirmed?: (evaluation: MentorEvaluation) => void;
  // Refreshes the placement's list after an unknown create outcome and resolves
  // with it (undefined when it could not be loaded).
  onCreateUncertain?: () => Promise<MentorEvaluation[] | undefined>;
  // The server said the placement or evaluation state changed.
  onStaleState?: () => void;
  // A new draft from an older version got a new id (see startNewDraftKey).
  onDraftIdChange?: (draftId: string) => void;
}

interface InitialState {
  baseline: MentorEvaluation | null;
  local: string;
  phase: EditorPhase;
  latest: MentorEvaluation | null;
  recovered: boolean;
  // The server's version when recovered text was based on an older revision.
  recoveredServer: MentorEvaluation | null;
  // The restored copy's writeId (this editor then owns that entry).
  restoredWriteId: string | null;
  // A stored copy identical to the server's text (nothing to recover): removed
  // once the editor is shown.
  leftoverWriteId: string | null;
}

function targetFor(baseline: MentorEvaluation | null, clientDraftId: string): BackupTarget {
  return baseline ? { evaluationId: baseline.id } : { clientDraftId };
}

// Restores a matching local copy (same user, same evaluation or new draft,
// same placement). It is never saved or published here.
function initialState(userId: string, placementId: string, initial: MentorEvaluation | null, clientDraftId: string): InitialState {
  const plain: InitialState = {
    baseline: initial, local: initial?.content ?? '', phase: { name: 'idle' }, latest: null, recovered: false, recoveredServer: null,
    restoredWriteId: null, leftoverWriteId: null,
  };
  const backup = readBackup(userId, targetFor(initial, clientDraftId));
  if (!backup || backup.placementId !== (initial?.placementId ?? placementId)) return plain;
  if (!initial) return { ...plain, local: backup.text, recovered: true, restoredWriteId: backup.writeId };
  if (backup.text === initial.content) return { ...plain, leftoverWriteId: backup.writeId };
  if (backup.baseRevision === initial.revision) return { ...plain, local: backup.text, recovered: true, restoredWriteId: backup.writeId };
  // The evaluation changed since the copy was made: keep both versions and
  // let the Mentor choose in the conflict dialog. The baseline stays at the
  // copy's revision, so saving can never silently overwrite the newer one.
  const stale: MentorEvaluation = { ...initial, revision: backup.baseRevision as number, content: backup.baseContent as string };
  return {
    baseline: stale,
    local: backup.text,
    phase: {
      name: 'conflict',
      source: 'recovery',
      attempt: { kind: 'save', evaluationId: initial.id, expectedRevision: stale.revision, content: backup.text },
      currentRevision: initial.revision,
    },
    latest: initial,
    recovered: true,
    recoveredServer: initial,
    restoredWriteId: backup.writeId,
    leftoverWriteId: null,
  };
}

// Editor state for one evaluation. Three separate things are kept:
// - baseline: the last version confirmed by the server (exact text + revision),
// - local: what the Mentor is typing,
// - phase: the outcome of the last write (with the exact attempt).
// The local text is never overwritten automatically: only an explicit choice
// (replace with the latest version, use the saved version, discard) changes it.
//
// Local copy: whenever the local text differs from the baseline, it is copied
// to sessionStorage. The copy is removed only when the local text equals a
// server-confirmed version (after a confirmed save, or an explicit choice of
// a server version or discard), never on failure, unknown outcome, conflict,
// sign-out or unmount.
//
// Ownership: every write has a unique writeId, and this editor remembers the
// writeIds it wrote (or restored). It never removes an entry whose writeId it
// does not own. After it is closed (a request confirmed late, after the
// Mentor switched away or the session ended), it never writes; it only removes
// its own entry, and only if that entry holds exactly the confirmed text. So a
// closed editor can never remove or overwrite a newer copy made by another
// editor of the same evaluation.
export function useEvaluationEditor({
  userId, placementId, initial, clientDraftId, placementReadOnly = false, onConfirmed, onCreateUncertain, onStaleState,
  onDraftIdChange,
}: Options) {
  const [init] = useState(() => initialState(userId, placementId, initial, clientDraftId));
  // The new draft's id, which is also its create key. It only changes through
  // startNewDraftKey (an explicit choice for a copy from an older version).
  const [draftId, setDraftId] = useState(clientDraftId);
  const draftIdRef = useRef(clientDraftId);
  const [baseline, setBaseline] = useState<MentorEvaluation | null>(init.baseline);
  const [local, setLocalState] = useState<string>(init.local);
  const [phase, setPhase] = useState<EditorPhase>(init.phase);
  const [latest, setLatest] = useState<MentorEvaluation | null>(init.latest);
  const [latestError, setLatestError] = useState<string | undefined>(undefined);
  const [recovered, setRecovered] = useState(init.recovered);
  const [recoveredServer, setRecoveredServer] = useState<MentorEvaluation | null>(init.recoveredServer);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(init.recovered ? 'kept' : 'none');
  // The server stored something other than what was sent (should not happen;
  // the text is never normalized). The local text is kept; the user decides.
  const [serverDiffers, setServerDiffers] = useState(false);
  const inFlight = useRef(false);
  // Current values for code that runs after an await (the Mentor may have
  // typed more while a request was in flight).
  const localRef = useRef(init.local);
  const baselineRef = useRef(init.baseline);
  // Local-copy entries this editor wrote or restored: key -> target, writeId.
  const owned = useRef<Map<string, { target: BackupTarget; writeId: string }>>(new Map(
    init.restoredWriteId
      ? [[backupKey(userId, targetFor(init.baseline, clientDraftId)), { target: targetFor(init.baseline, clientDraftId), writeId: init.restoredWriteId }]]
      : [],
  ));
  const mounted = useRef(false);
  const [editorId] = useState(() => newClientDraftId());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const dirty = baseline ? local !== baseline.content : local !== '';
  const busy = phase.name === 'pending' || (phase.name === 'uncertain' && phase.checking);
  const readOnly = placementReadOnly || (baseline?.readOnly ?? false);

  // Removes an entry only if it is still exactly the one this editor owns
  // (and, when given, still holds exactly `text`).
  const removeOwned = useCallback((key: string, text?: string) => {
    const entry = owned.current.get(key);
    owned.current.delete(key);
    if (!entry) return;
    const stored = readBackup(userId, entry.target);
    if (stored && stored.writeId === entry.writeId && (text === undefined || stored.text === text)) removeBackup(key, editorId);
  }, [editorId, userId]);

  const syncBackup = useCallback(() => {
    const current = baselineRef.current;
    const text = localRef.current;
    const target = targetFor(current, draftIdRef.current);
    const key = backupKey(userId, target);
    const isDirty = current ? text !== current.content : text !== '';

    if (!mounted.current) {
      // Closed editor (late confirmation): never write; remove only its own
      // entries that hold exactly the text now confirmed by the server.
      if (!isDirty) for (const ownedKey of [...owned.current.keys()]) removeOwned(ownedKey, text);
      return;
    }

    let stored = true;
    if (isDirty) {
      const writeId = newClientDraftId();
      stored = writeBackup({
        version: 1,
        userId,
        placementId: current?.placementId ?? placementId,
        evaluationId: current?.id ?? null,
        clientDraftId: current ? null : draftIdRef.current,
        baseRevision: current?.revision ?? null,
        baseContent: current?.content ?? null,
        text,
        updatedAt: new Date().toISOString(),
        writeId,
      });
      if (stored) owned.current.set(key, { target, writeId });
      setBackupStatus(stored ? 'kept' : 'unavailable');
    } else {
      // The local text is exactly a server-confirmed version.
      removeOwned(key);
      setBackupStatus('none');
    }
    // An entry used earlier (the new-draft key after a create): its text is
    // now saved or held by the current copy. Kept if the current copy failed.
    if (stored) {
      for (const ownedKey of [...owned.current.keys()]) {
        if (ownedKey !== key) removeOwned(ownedKey);
      }
    }
  }, [placementId, removeOwned, userId]);

  // Another (closed) editor removed this editor's current entry, because its
  // late save confirmed exactly that text. While this editor still has unsaved
  // text relative to its own version, it writes its copy again, so "a copy is
  // kept" stays true.
  useEffect(() => onBackupRemoved((key, removedBy) => {
    if (removedBy === editorId || !mounted.current) return;
    if (key === backupKey(userId, targetFor(baselineRef.current, draftIdRef.current))) syncBackup();
  }), [editorId, syncBackup, userId]);

  const setLocal = useCallback((text: string) => {
    localRef.current = text;
    setLocalState(text);
    syncBackup();
  }, [syncBackup]);

  const setConfirmedBaseline = useCallback((evaluation: MentorEvaluation) => {
    baselineRef.current = evaluation;
    setBaseline(evaluation);
    syncBackup();
  }, [syncBackup]);

  // A copy that only repeats the server's text: removed, but only if it is
  // still exactly that entry (never another editor's newer copy).
  useEffect(() => {
    if (!init.leftoverWriteId || !init.baseline) return;
    const target = { evaluationId: init.baseline.id };
    const stored = readBackup(userId, target);
    if (stored && stored.writeId === init.leftoverWriteId && stored.text === init.baseline.content) {
      removeBackup(backupKey(userId, target), editorId);
    }
  }, [editorId, init, userId]);

  // The server already has this create operation's evaluation (an earlier
  // request of it succeeded): continue on it. The local text is kept; if it
  // differs, it stays unsaved (and backed up) until the Mentor saves.
  const adopt = useCallback((evaluation: MentorEvaluation) => {
    setConfirmedBaseline(evaluation);
    setServerDiffers(false);
    setLatest(null);
    setRecoveredServer(null);
    setPhase(localRef.current === evaluation.content ? { name: 'succeeded', kind: 'create' } : { name: 'adopted' });
    onConfirmed?.(evaluation);
  }, [onConfirmed, setConfirmedBaseline]);

  const confirm = useCallback((evaluation: MentorEvaluation, attempt: EvaluationAttempt) => {
    setConfirmedBaseline(evaluation);
    setServerDiffers(attempt.kind !== 'publish' && evaluation.content !== attempt.content);
    setPhase({ name: 'succeeded', kind: attempt.kind });
    setLatest(null);
    setRecoveredServer(null);
    onConfirmed?.(evaluation);
  }, [onConfirmed, setConfirmedBaseline]);

  const run = useCallback(async (attempt: EvaluationAttempt) => {
    if (inFlight.current) return; // no duplicate submissions
    inFlight.current = true;
    setPhase({ name: 'pending', attempt });
    try {
      const result = attempt.kind === 'create'
        ? await createMentorEvaluation(attempt.placementId, attempt.clientRequestId, attempt.content)
        : attempt.kind === 'save'
          ? await saveMentorEvaluation(attempt.evaluationId, attempt.content, attempt.expectedRevision)
          : await publishMentorEvaluation(attempt.evaluationId, attempt.expectedRevision);
      confirm(result, attempt);
    } catch (error) {
      if (error instanceof EvaluationRequestError && error.outcome === 'not-applied') {
        if (attempt.kind === 'create' && error.code === 'EVALUATION_CREATE_KEY_REUSED' && error.evaluationId) {
          // An earlier request of this operation created it (with other text):
          // read it and continue on it. Nothing is created a second time.
          try {
            adopt(await getMentorEvaluation(error.evaluationId));
          } catch (readError) {
            setPhase({ name: 'failed', attempt, code: readError instanceof EvaluationRequestError ? readError.code : undefined });
          }
          return;
        }
        if (error.code && STALE_STATE_CODES.has(error.code)) onStaleState?.();
        setPhase(error.code === 'EVALUATION_REVISION_CONFLICT'
          ? { name: 'conflict', attempt, currentRevision: error.currentRevision }
          : { name: 'failed', attempt, code: error.code });
      } else {
        setPhase({ name: 'uncertain', attempt, checking: false, checkResult: 'none' });
      }
    } finally {
      inFlight.current = false;
    }
  }, [adopt, confirm, onStaleState]);

  // A new draft whose id is not a valid create key: a copy made by an older
  // version. Such an id was never accepted by the server, so no evaluation can
  // exist for it, but it is not replaced silently: the Mentor chooses.
  const legacyDraftKey = baseline === null && !isClientRequestKey(draftId);

  const save = useCallback(() => {
    if (readOnly || inFlight.current) return;
    const content = local;
    if (!baseline && !isClientRequestKey(draftIdRef.current)) {
      setPhase({ name: 'failed', attempt: { kind: 'create', placementId, clientRequestId: draftIdRef.current, content }, code: 'LEGACY_DRAFT_KEY' });
      return;
    }
    const problem = contentProblem(content);
    if (problem) {
      setPhase({ name: 'failed', attempt: { kind: 'save', evaluationId: baseline?.id ?? '', expectedRevision: baseline?.revision ?? 0, content }, code: problem });
      return;
    }
    void run(baseline
      ? { kind: 'save', evaluationId: baseline.id, expectedRevision: baseline.revision, content }
      : { kind: 'create', placementId, clientRequestId: draftIdRef.current, content });
  }, [baseline, local, placementId, readOnly, run]);

  // Explicit choice for a legacy new draft: give it a new, valid create key.
  // The local text moves to a copy under the new id (the old copy is removed
  // only once the new one is stored). Nothing is sent: the Mentor still saves.
  const startNewDraftKey = useCallback(() => {
    if (baselineRef.current || isClientRequestKey(draftIdRef.current) || inFlight.current) return;
    const next = newClientDraftId();
    draftIdRef.current = next;
    setDraftId(next);
    syncBackup();
    setPhase({ name: 'idle' });
    onDraftIdChange?.(next);
  }, [onDraftIdChange, syncBackup]);

  // Publishes the confirmed saved text only, never unsaved local text.
  const canPublish = !!baseline && !readOnly && !dirty && !busy
    && !isBlank(baseline.content) && baseline.publicationState !== 'PUBLISHED';

  const publish = useCallback(() => {
    if (!baseline || readOnly || inFlight.current || local !== baseline.content) return;
    void run({ kind: 'publish', evaluationId: baseline.id, expectedRevision: baseline.revision, content: baseline.content });
  }, [baseline, local, readOnly, run]);

  // Explicit retry of the exact original attempt after an uncertain outcome
  // (after a confirmed failure the Mentor simply saves again). A create retry
  // reuses its key, so it can never create a second evaluation.
  const retry = useCallback(() => {
    if (phase.name === 'uncertain' && !phase.checking) void run(phase.attempt);
  }, [phase, run]);

  // After an uncertain outcome: one fresh, uncached read. Success is confirmed
  // only if the server state matches exactly what this attempt would produce;
  // anything else stays "unconfirmed" (never reported as a failure).
  const checkOutcome = useCallback(async () => {
    if (phase.name !== 'uncertain' || inFlight.current) return;
    const attempt = phase.attempt;
    if (attempt.kind === 'create') {
      // Wait for the refreshed list; the create is recognised by its key.
      inFlight.current = true;
      setPhase({ name: 'uncertain', attempt, checking: true, checkResult: 'none' });
      try {
        const rows = onCreateUncertain ? await onCreateUncertain() : undefined;
        const created = rows?.find((row) => row.clientRequestId === attempt.clientRequestId);
        if (created) adopt(created);
        else setPhase({ name: 'uncertain', attempt, checking: false, checkResult: rows ? 'not-in-list' : 'unconfirmed' });
      } catch {
        setPhase({ name: 'uncertain', attempt, checking: false, checkResult: 'unconfirmed' });
      } finally {
        inFlight.current = false;
      }
      return;
    }
    inFlight.current = true;
    setPhase({ name: 'uncertain', attempt, checking: true, checkResult: 'none' });
    try {
      const current = await getMentorEvaluation(attempt.evaluationId);
      const confirmed = attempt.kind === 'save'
        ? current.revision === attempt.expectedRevision + 1 && current.content === attempt.content
        : current.published !== null
          && current.published.revision === attempt.expectedRevision + 1
          && current.published.content === attempt.content
          && current.published.publishedByCurrentUser;
      if (confirmed) {
        confirm(current, attempt);
      } else {
        setLatest(current);
        setPhase({ name: 'uncertain', attempt, checking: false, checkResult: 'unconfirmed' });
      }
    } catch {
      setPhase({ name: 'uncertain', attempt, checking: false, checkResult: 'unconfirmed' });
    } finally {
      inFlight.current = false;
    }
  }, [adopt, confirm, onCreateUncertain, phase]);

  // ---- Conflict choices (nothing is sent by any of them) ----

  const viewLatest = useCallback(async () => {
    if (!baseline) return;
    setLatestError(undefined);
    try {
      setLatest(await getMentorEvaluation(baseline.id));
    } catch (error) {
      setLatestError(error instanceof EvaluationRequestError ? error.code : undefined);
    }
  }, [baseline]);

  // After explicit confirmation in the UI: the local text becomes the latest version.
  const replaceWithLatest = useCallback(() => {
    if (!latest) return;
    baselineRef.current = latest;
    setBaseline(latest);
    setLocal(latest.content);
    setLatest(null);
    setRecoveredServer(null);
    setServerDiffers(false);
    setPhase({ name: 'idle' });
  }, [latest, setLocal]);

  // Keep the local text but base the next save on the latest revision. Nothing
  // is sent: the Mentor still has to press Save.
  const keepMyTextOnLatest = useCallback(() => {
    if (!latest) return;
    setConfirmedBaseline(latest);
    setLatest(null);
    setRecoveredServer(null);
    setPhase({ name: 'idle' });
  }, [latest, setConfirmedBaseline]);

  const keepEditing = useCallback(() => {
    setLatest(null);
    setPhase({ name: 'idle' });
  }, []);

  const applySavedVersion = useCallback(() => {
    if (!baseline) return;
    setLocal(baseline.content);
    setServerDiffers(false);
  }, [baseline, setLocal]);

  // After explicit confirmation in the UI: drop the unsaved local text (and its
  // local copy) and show the server's version again.
  const discardLocalText = useCallback(() => {
    if (busy) return;
    const server = recoveredServer ?? baselineRef.current;
    if (server) {
      baselineRef.current = server;
      setBaseline(server);
    }
    setLocal(server?.content ?? '');
    setLatest(null);
    setRecoveredServer(null);
    setRecovered(false);
    setServerDiffers(false);
    setPhase({ name: 'idle' });
  }, [busy, recoveredServer, setLocal]);

  return {
    baseline,
    local,
    setLocal,
    phase,
    dirty,
    busy,
    readOnly,
    canPublish,
    latest,
    latestError,
    serverDiffers,
    // Recovered local text that is still unsaved.
    recovered: recovered && dirty,
    backupStatus: dirty ? backupStatus : 'none',
    save,
    publish,
    retry,
    checkOutcome,
    viewLatest,
    replaceWithLatest,
    keepMyTextOnLatest,
    keepEditing,
    applySavedVersion,
    discardLocalText,
    legacyDraftKey,
    startNewDraftKey,
    dismissPhase: () => setPhase({ name: 'idle' }),
  };
}
