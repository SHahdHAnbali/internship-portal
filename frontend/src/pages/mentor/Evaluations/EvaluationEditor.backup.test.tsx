// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MentorEvaluation } from '@/features/evaluations/types';

const api = vi.hoisted(() => ({
  createMentorEvaluation: vi.fn(),
  saveMentorEvaluation: vi.fn(),
  publishMentorEvaluation: vi.fn(),
  getMentorEvaluation: vi.fn(),
}));
vi.mock('@/features/evaluations/evaluations.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/evaluations/evaluations.service')>()),
  ...api,
}));

import { EvaluationRequestError } from '@/features/evaluations/evaluations.service';
import { backupKey, writeBackup, type BackupTarget, type EvaluationBackup } from '@/features/evaluations/local-backup';
import EvaluationEditor from './EvaluationEditor';

const USER = 'mentor-1';

function evaluation(overrides: Partial<MentorEvaluation> = {}): MentorEvaluation {
  return {
    id: 'e1', placementId: 'p1', placementStatus: 'ACTIVE', readOnly: false, content: 'Saved text',
    publicationState: 'DRAFT', revision: 2, published: null, authorName: 'Mentor One', lastEditorName: 'Mentor One', clientRequestId: null,
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z',
    ...overrides,
  };
}

function stored(target: BackupTarget = { evaluationId: 'e1' }, userId = USER): EvaluationBackup | null {
  const raw = sessionStorage.getItem(backupKey(userId, target));
  return raw === null ? null : JSON.parse(raw) as EvaluationBackup;
}

function seed(overrides: Partial<EvaluationBackup> = {}) {
  writeBackup({
    version: 1, userId: USER, placementId: 'p1', evaluationId: 'e1', clientDraftId: null,
    baseRevision: 2, baseContent: 'Saved text', text: 'Recovered text', updatedAt: '2026-10-18T10:00:00Z', writeId: 'seeded-write',
    ...overrides,
  });
}

function renderEditor(initial: MentorEvaluation | null = evaluation(), options: { userId?: string; draftId?: string } = {}) {
  const result = render(
    <EvaluationEditor
      userId={options.userId ?? USER}
      clientDraftId={options.draftId ?? '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'}
      placementId="p1"
      placementStatus={initial?.placementStatus ?? 'ACTIVE'}
      initial={initial}
    />,
  );
  return { ...result, textarea: () => screen.getByLabelText('Evaluation') as HTMLTextAreaElement };
}

const type = (textarea: HTMLTextAreaElement, value: string) => fireEvent.change(textarea, { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('EvaluationEditor local backup', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); sessionStorage.clear(); });

  it('1. writes a scoped backup when the text changes', () => {
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    expect(stored()).toMatchObject({ userId: USER, placementId: 'p1', evaluationId: 'e1', baseRevision: 2, baseContent: 'Saved text', text: 'Unsaved edit' });
    expect(screen.getByText(/kept in this browser tab only \(not on the server\)/)).toBeTruthy();
  });

  it('2. stores nothing without unsaved changes, and removes its copy when the text is back to the saved version', () => {
    const { textarea } = renderEditor();
    expect(sessionStorage.length).toBe(0);
    type(textarea(), 'Edit');
    type(textarea(), 'Saved text');
    expect(stored()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('3. recovers the text when the editor is recreated, clearly marked as unsaved', () => {
    const first = renderEditor();
    type(first.textarea(), 'Unsaved edit');
    first.unmount();
    renderEditor();
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Unsaved edit');
    const notice = screen.getByText('Recovered local, unsaved text').closest('[role="status"]');
    expect(notice?.textContent).toContain('kept only in this browser tab and has not been saved on the server');
  });

  it('4. keeps the backup when a save fails because the session expired and the editor unmounts', async () => {
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', status: 401, code: 'SESSION_EXPIRED' }));
    const { textarea, unmount } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click('Save draft');
    await screen.findByRole('alert');
    unmount(); // route guard after sign-out / session end
    expect(stored()?.text).toBe('Unsaved edit');
  });

  it('5. never saves or publishes recovered text automatically', async () => {
    seed();
    renderEditor();
    await act(async () => { await Promise.resolve(); });
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Recovered text');
    expect(api.saveMentorEvaluation).not.toHaveBeenCalled();
    expect(api.createMentorEvaluation).not.toHaveBeenCalled();
    expect(api.publishMentorEvaluation).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('6. a newer server revision keeps the recovered text and opens the existing conflict choices', async () => {
    seed({ baseRevision: 2, baseContent: 'Saved text', text: 'Recovered text' });
    renderEditor(evaluation({ revision: 4, content: 'Changed elsewhere' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('based on revision 2');
    expect(dialog.textContent).toContain('(revision 4)');
    expect(within(dialog).getByText('Changed elsewhere')).toBeTruthy();
    for (const name of [/Copy my text/, /View latest/, 'Replace my text', /Keep my text and save it over this version/, 'Keep editing']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Recovered text');

    // Keeping editing and saving still targets the old revision (refused by the server, never silent).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', code: 'EVALUATION_REVISION_CONFLICT', currentRevision: 4 }));
    click('Save draft');
    expect(api.saveMentorEvaluation).toHaveBeenCalledWith('e1', 'Recovered text', 2);
    await screen.findByRole('dialog');
    expect(stored()?.text).toBe('Recovered text');
  });

  it('6b. "Keep my text" rebases the backup on the newer revision without sending anything', () => {
    seed();
    renderEditor(evaluation({ revision: 4, content: 'Changed elsewhere' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Keep my text and save it over this version/ }));
    expect(stored()).toMatchObject({ baseRevision: 4, baseContent: 'Changed elsewhere', text: 'Recovered text' });
    expect(api.saveMentorEvaluation).not.toHaveBeenCalled();
  });

  it('7. a confirmed save clears only the backup for exactly that text and revision', async () => {
    seed({ evaluationId: 'e2', text: 'Other evaluation text' });
    api.saveMentorEvaluation.mockResolvedValue(evaluation({ content: 'Unsaved edit', revision: 3 }));
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click('Save draft');
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(stored()).toBeNull();
    expect(stored({ evaluationId: 'e2' })?.text).toBe('Other evaluation text');
  });

  it('7b. a confirmed save whose stored text differs from what was sent keeps the backup', async () => {
    api.saveMentorEvaluation.mockResolvedValue(evaluation({ content: 'Something else', revision: 3 }));
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click('Save draft');
    await screen.findByText(/saved text differs/);
    expect(stored()).toMatchObject({ text: 'Unsaved edit', baseRevision: 3 });
  });

  it('8. text typed during a save keeps its backup when the older save succeeds', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const { textarea } = renderEditor();
    type(textarea(), 'First part');
    click('Save draft');
    type(textarea(), 'First part and more');
    await act(async () => { pending.resolve(evaluation({ content: 'First part', revision: 3 })); });
    expect(stored()).toMatchObject({ text: 'First part and more', baseRevision: 3, baseContent: 'First part' });
  });

  it('8b. a confirmed create moves newer text to the created evaluation\'s backup', async () => {
    const pending = deferred<MentorEvaluation>();
    api.createMentorEvaluation.mockReturnValue(pending.promise);
    const { textarea } = renderEditor(null);
    type(textarea(), 'Draft');
    expect(stored({ clientDraftId: '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' })?.text).toBe('Draft');
    click('Save draft');
    type(textarea(), 'Draft plus');
    await act(async () => { pending.resolve(evaluation({ id: 'e7', content: 'Draft', revision: 1 })); });
    expect(stored({ evaluationId: 'e7' })).toMatchObject({ text: 'Draft plus', baseRevision: 1 });
    expect(stored({ clientDraftId: '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' })).toBeNull();
  });

  // The service reports a network failure and its 30 s timeout as an 'unknown'
  // outcome (the timeout itself is tested in evaluations.service.test.ts); here
  // that outcome is simulated directly.
  it('9. a server error, a simulated unknown outcome and a conflict keep the backup', async () => {
    const outcomes = [
      new EvaluationRequestError({ outcome: 'not-applied', status: 500, code: 'EVALUATION_SERVER_ERROR' }),
      new EvaluationRequestError({ outcome: 'unknown' }),
      new EvaluationRequestError({ outcome: 'not-applied', status: 409, code: 'EVALUATION_REVISION_CONFLICT', currentRevision: 3 }),
    ];
    for (const error of outcomes) {
      api.saveMentorEvaluation.mockRejectedValueOnce(error);
      const { textarea, unmount } = renderEditor();
      type(textarea(), 'Unsaved edit');
      click('Save draft');
      await act(async () => { await Promise.resolve(); });
      expect(stored()?.text).toBe('Unsaved edit');
      unmount();
      expect(stored()?.text).toBe('Unsaved edit');
      sessionStorage.clear();
    }
  });

  it('9c. a save refused because another tab changed the sign-in keeps the text and the backup, and sends nothing', async () => {
    seed({ evaluationId: 'e2', text: 'Other evaluation text' });
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', code: 'IDENTITY_MISMATCH' }));
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click('Save draft');
    expect((await screen.findByRole('alert')).textContent).toContain('signed in or out in another tab');
    expect(textarea().value).toBe('Unsaved edit');
    expect(stored()).toMatchObject({ text: 'Unsaved edit', baseRevision: 2 });
    expect(stored({ evaluationId: 'e2' })?.text).toBe('Other evaluation text');
  });

  it('9b. an unconfirmed outcome check keeps the backup', async () => {
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'unknown' }));
    api.getMentorEvaluation.mockResolvedValue(evaluation({ revision: 2, content: 'Saved text' }));
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click('Save draft');
    fireEvent.click(await screen.findByRole('button', { name: 'Check whether it was saved' }));
    await screen.findByRole('button', { name: 'Try again' });
    expect(stored()?.text).toBe('Unsaved edit');
  });

  it('10. explicit discard (after confirmation) clears only this evaluation\'s backup', () => {
    seed({ evaluationId: 'e2', text: 'Other evaluation text' });
    const { textarea } = renderEditor();
    type(textarea(), 'Unsaved edit');
    click(/Discard unsaved text/);
    expect(stored()?.text).toBe('Unsaved edit'); // not yet confirmed
    click('Cancel');
    click(/Discard unsaved text/);
    click('Yes, discard');
    expect(textarea().value).toBe('Saved text');
    expect(stored()).toBeNull();
    expect(stored({ evaluationId: 'e2' })?.text).toBe('Other evaluation text');
  });

  it('10b. discarding recovered text based on an older revision shows the server\'s current version', () => {
    seed();
    renderEditor(evaluation({ revision: 4, content: 'Changed elsewhere' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }));
    click(/Discard unsaved text/);
    click('Yes, discard');
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Changed elsewhere');
    expect(stored()).toBeNull();
  });

  it('11. never restores another user\'s, evaluation\'s or placement\'s backup', () => {
    seed({ userId: 'mentor-2', text: 'Other Mentor' });
    seed({ evaluationId: 'e2', text: 'Other evaluation' });
    seed({ evaluationId: null, clientDraftId: '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', baseRevision: null, baseContent: null, placementId: 'p2', text: 'Other placement' });
    const existing = renderEditor();
    expect(existing.textarea().value).toBe('Saved text');
    expect(screen.queryByText('Recovered local, unsaved text')).toBeNull();
    existing.unmount();
    const fresh = renderEditor(null);
    expect(fresh.textarea().value).toBe('');
    expect(stored(undefined, 'mentor-2')?.text).toBe('Other Mentor');
  });

  it('12. ignores malformed data safely and leaves it untouched until the Mentor types', () => {
    const key = backupKey(USER, { evaluationId: 'e1' });
    sessionStorage.setItem(key, '{"version":1,"text":');
    const { textarea } = renderEditor();
    expect(textarea().value).toBe('Saved text');
    expect(sessionStorage.getItem(key)).toBe('{"version":1,"text":');
    type(textarea(), 'Edit');
    expect(stored()?.text).toBe('Edit');
  });

  it('12b. warns when the browser does not allow a local copy', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const { textarea } = renderEditor();
    type(textarea(), 'Edit');
    expect(screen.getByRole('alert').textContent).toContain('did not allow a temporary local copy');
    expect(textarea().value).toBe('Edit');
  });
});

describe('EvaluationEditor local backup: late confirmations of a closed editor', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });

  it('a closed editor\'s late save never removes the newer copy of the editor that reopened the evaluation', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor();
    type(first.textarea(), 'Text T');
    click('Save draft');
    first.unmount(); // the Mentor switched away while the save was in flight

    renderEditor(); // reopened: recovers T, then keeps typing
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Text T');
    type(screen.getByLabelText('Evaluation') as HTMLTextAreaElement, 'Text T and newer text');

    await act(async () => { pending.resolve(evaluation({ content: 'Text T', revision: 3 })); });
    expect(stored()?.text).toBe('Text T and newer text');
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Text T and newer text');
  });

  it('a closed editor\'s late save never overwrites the newer copy with its own text', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor();
    type(first.textarea(), 'Sent text');
    click('Save draft');
    type(first.textarea(), 'Sent text plus typed during the save');
    first.unmount();

    renderEditor();
    type(screen.getByLabelText('Evaluation') as HTMLTextAreaElement, 'Newest text');
    await act(async () => { pending.resolve(evaluation({ content: 'Sent text', revision: 3 })); });
    expect(stored()).toMatchObject({ text: 'Newest text', baseRevision: 2 });
  });

  it('a closed editor removes its own copy only when it holds exactly the confirmed text', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor();
    type(first.textarea(), 'Saved later');
    click('Save draft');
    first.unmount();
    expect(stored()?.text).toBe('Saved later');
    await act(async () => { pending.resolve(evaluation({ content: 'Saved later', revision: 3 })); });
    expect(stored()).toBeNull(); // exactly that text is now on the server
  });

  it('a reopened editor that has not typed yet keeps an accurate copy after the closed editor\'s late save removed it', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor();
    type(first.textarea(), 'Text T');
    click('Save draft');
    first.unmount();

    renderEditor(); // recovers T (based on revision 2) without typing
    expect(screen.getByText(/kept in this browser tab only \(not on the server\)/)).toBeTruthy();
    await act(async () => { pending.resolve(evaluation({ content: 'Text T', revision: 3 })); });
    // The closed editor removed its exact copy; the open one wrote its own again.
    expect(stored()).toMatchObject({ text: 'Text T', baseRevision: 2 });
    expect(stored()?.writeId).not.toBe(undefined);
    expect(screen.getByText(/kept in this browser tab only \(not on the server\)/)).toBeTruthy();
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);
  });

  it('a closed editor keeps its copy when it had newer text than the confirmed save', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor();
    type(first.textarea(), 'Sent');
    click('Save draft');
    type(first.textarea(), 'Sent and more');
    first.unmount();
    await act(async () => { pending.resolve(evaluation({ content: 'Sent', revision: 3 })); });
    expect(stored()).toMatchObject({ text: 'Sent and more', baseRevision: 2 });
  });

  it('a closed editor\'s late create removes the draft copy only for exactly the created text', async () => {
    const pending = deferred<MentorEvaluation>();
    api.createMentorEvaluation.mockReturnValue(pending.promise);
    const first = renderEditor(null);
    type(first.textarea(), 'New draft');
    click('Save draft');
    first.unmount();
    await act(async () => { pending.resolve(evaluation({ id: 'e9', content: 'New draft', revision: 1 })); });
    expect(stored({ clientDraftId: '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' })).toBeNull();
    expect(stored({ evaluationId: 'e9' })).toBeNull();
  });
});
