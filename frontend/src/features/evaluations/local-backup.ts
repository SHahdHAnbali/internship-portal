// A temporary copy of a Mentor's unsaved evaluation text in sessionStorage
// (this browser tab only), so the text survives the editor being unmounted:
// session expiry, sign-out, or navigation. It is never sent anywhere, never
// saved automatically, and holds no credentials: only the user id, the
// evaluation (or new-draft) id, the last server-confirmed revision and text,
// and the local text.
//
// One entry per user and evaluation:
//   <prefix><userId>:e:<evaluationId>   an existing evaluation
//   <prefix><userId>:n:<clientDraftId>  a new evaluation not created yet

const PREFIX = 'internship-portal.evaluation-backup.v1:';

export type BackupTarget = { evaluationId: string } | { clientDraftId: string };

export interface EvaluationBackup {
  version: 1;
  userId: string;
  placementId: string;
  // Exactly one of evaluationId / clientDraftId is set.
  evaluationId: string | null;
  clientDraftId: string | null;
  // The last server-confirmed version the local text is based on (null for a
  // new evaluation).
  baseRevision: number | null;
  baseContent: string | null;
  text: string;
  updatedAt: string;
  // Unique per write. An editor only removes an entry whose writeId it wrote
  // (or restored) itself, so a closed editor never removes a newer copy.
  writeId: string;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled or blocked
  }
}

function userPrefix(userId: string): string {
  return `${PREFIX}${encodeURIComponent(userId)}:`;
}

export function backupKey(userId: string, target: BackupTarget): string {
  return 'evaluationId' in target
    ? `${userPrefix(userId)}e:${encodeURIComponent(target.evaluationId)}`
    : `${userPrefix(userId)}n:${encodeURIComponent(target.clientDraftId)}`;
}

function targetOf(backup: EvaluationBackup): BackupTarget {
  return backup.evaluationId !== null
    ? { evaluationId: backup.evaluationId }
    : { clientDraftId: backup.clientDraftId as string };
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

// Accepts only a well-formed entry of this version that belongs to `userId`
// and is stored under its own key. Anything else is ignored (never thrown).
function parse(raw: string | null, userId: string, key: string): EvaluationBackup | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.userId !== userId || !isNonEmptyString(v.placementId)) return null;
  if (typeof v.text !== 'string' || typeof v.updatedAt !== 'string' || !isNonEmptyString(v.writeId)) return null;
  const existing = isNonEmptyString(v.evaluationId) && v.clientDraftId === null
    && Number.isSafeInteger(v.baseRevision) && (v.baseRevision as number) >= 1 && typeof v.baseContent === 'string';
  const fresh = v.evaluationId === null && isNonEmptyString(v.clientDraftId)
    && v.baseRevision === null && v.baseContent === null;
  if (!existing && !fresh) return null;
  const backup = v as unknown as EvaluationBackup;
  return backupKey(userId, targetOf(backup)) === key ? backup : null;
}

export function readBackup(userId: string, target: BackupTarget): EvaluationBackup | null {
  const store = storage();
  if (!store) return null;
  const key = backupKey(userId, target);
  try {
    return parse(store.getItem(key), userId, key);
  } catch {
    return null;
  }
}

// Returns false when the copy could not be stored (storage blocked or full).
export function writeBackup(backup: EvaluationBackup): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(backupKey(backup.userId, targetOf(backup)), JSON.stringify(backup));
    return true;
  } catch {
    return false;
  }
}

// Editors of this tab that want to know when an entry is removed by someone
// else (a closed editor whose late save confirmed exactly that text).
type RemovalListener = (key: string, removedBy: string | undefined) => void;
const removalListeners = new Set<RemovalListener>();

export function onBackupRemoved(listener: RemovalListener): () => void {
  removalListeners.add(listener);
  return () => { removalListeners.delete(listener); };
}

// `removedBy` identifies the remover, so it can ignore its own removals.
export function removeBackup(key: string, removedBy?: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    return; // Nothing to do: the entry stays until the tab is closed.
  }
  for (const listener of [...removalListeners]) listener(key, removedBy);
}

// Every valid entry of this user (in this tab).
export function listBackups(userId: string): EvaluationBackup[] {
  const store = storage();
  if (!store) return [];
  const prefix = userPrefix(userId);
  const backups: EvaluationBackup[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const backup = parse(store.getItem(key), userId, key);
      if (backup) backups.push(backup);
    }
  } catch {
    return backups;
  }
  return backups;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whether a new draft's id can be sent as its create request's key (a UUID).
// Copies made by older versions may carry another id; they stay readable.
export function isClientRequestKey(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// A random UUID (version 4) for a new draft or a write. A new draft's id is
// also its create operation's idempotency key, so it must be a UUID. Not a
// secret; uniqueness per Mentor is what matters.
export function newClientDraftId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through
  }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
