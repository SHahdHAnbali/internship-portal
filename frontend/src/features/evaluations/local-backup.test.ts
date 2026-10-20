// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { backupKey, listBackups, newClientDraftId, readBackup, writeBackup, type EvaluationBackup } from './local-backup';

const backup = (overrides: Partial<EvaluationBackup> = {}): EvaluationBackup => ({
  version: 1, userId: 'mentor-1', placementId: 'p1', evaluationId: 'e1', clientDraftId: null,
  baseRevision: 2, baseContent: 'Saved', text: 'Local', updatedAt: '2026-10-18T10:00:00Z', writeId: 'w1',
  ...overrides,
});

describe('evaluation local backup storage', () => {
  afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

  it('stores only the scoped fields in sessionStorage (no tokens), never in localStorage', () => {
    expect(writeBackup(backup())).toBe(true);
    const raw = sessionStorage.getItem(backupKey('mentor-1', { evaluationId: 'e1' }));
    expect(Object.keys(JSON.parse(raw as string)).sort()).toEqual(
      ['baseContent', 'baseRevision', 'clientDraftId', 'evaluationId', 'placementId', 'text', 'updatedAt', 'userId', 'version', 'writeId'],
    );
    expect(localStorage.length).toBe(0);
  });

  it('reads a backup only for the same user and evaluation', () => {
    writeBackup(backup());
    expect(readBackup('mentor-1', { evaluationId: 'e1' })?.text).toBe('Local');
    expect(readBackup('mentor-2', { evaluationId: 'e1' })).toBeNull();
    expect(readBackup('mentor-1', { evaluationId: 'e2' })).toBeNull();
    expect(listBackups('mentor-2')).toEqual([]);
  });

  it('ignores an entry copied under another user\'s or evaluation\'s key', () => {
    sessionStorage.setItem(backupKey('mentor-2', { evaluationId: 'e1' }), JSON.stringify(backup()));
    sessionStorage.setItem(backupKey('mentor-1', { evaluationId: 'e9' }), JSON.stringify(backup()));
    expect(readBackup('mentor-2', { evaluationId: 'e1' })).toBeNull();
    expect(readBackup('mentor-1', { evaluationId: 'e9' })).toBeNull();
    expect(listBackups('mentor-1')).toEqual([]);
  });

  it('ignores malformed or unsupported data without throwing', () => {
    const key = backupKey('mentor-1', { evaluationId: 'e1' });
    for (const raw of ['not json', 'null', '[]', JSON.stringify({ ...backup(), version: 2 }),
      JSON.stringify({ ...backup(), text: 5 }), JSON.stringify({ ...backup(), baseRevision: 0 }),
      JSON.stringify({ ...backup(), clientDraftId: 'd1' }), JSON.stringify({ ...backup(), baseContent: null }),
      JSON.stringify({ ...backup(), writeId: undefined }), JSON.stringify({ ...backup(), writeId: '' })]) {
      sessionStorage.setItem(key, raw);
      expect(readBackup('mentor-1', { evaluationId: 'e1' })).toBeNull();
    }
    expect(listBackups('mentor-1')).toEqual([]);
  });

  it('reports a failed write (storage full or blocked) instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(writeBackup(backup())).toBe(false);
  });

  it('keeps new-draft backups apart and lists them', () => {
    writeBackup(backup({ evaluationId: null, clientDraftId: 'd1', baseRevision: null, baseContent: null, text: 'New' }));
    expect(readBackup('mentor-1', { clientDraftId: 'd1' })?.text).toBe('New');
    expect(readBackup('mentor-1', { clientDraftId: 'd2' })).toBeNull();
    expect(listBackups('mentor-1').map((b) => b.clientDraftId)).toEqual(['d1']);
  });
});

describe('client ids', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('are UUIDs (a new draft id is also its create key) and unique', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientDraftId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('are still UUIDs when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.fill(171); return bytes; } });
    expect(newClientDraftId()).toMatch(UUID_V4);
  });
});
