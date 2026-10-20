// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { backupKey, writeBackup } from '@/features/evaluations/local-backup';
import EvaluationEditor from './EvaluationEditor';

const USER = 'mentor-1';
const DRAFT = '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b';
const CREATED = '11111111-2222-4333-8444-555555555555';

function evaluation(overrides: Partial<MentorEvaluation> = {}): MentorEvaluation {
  return {
    id: CREATED, placementId: 'p1', placementStatus: 'ACTIVE', readOnly: false, content: 'Draft text',
    publicationState: 'DRAFT', revision: 1, published: null, authorName: 'Mentor One', lastEditorName: 'Mentor One',
    clientRequestId: DRAFT, createdAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-18T10:00:00Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const unknown = () => new EvaluationRequestError({ outcome: 'unknown' });
const stored = (target: { evaluationId: string } | { clientDraftId: string }) => {
  const raw = sessionStorage.getItem(backupKey(USER, target));
  return raw === null ? null : JSON.parse(raw) as { text: string; baseRevision: number | null; writeId: string };
};

function renderNew(props: Partial<Parameters<typeof EvaluationEditor>[0]> = {}) {
  const onConfirmed = vi.fn();
  render(
    <EvaluationEditor
      userId={USER} clientDraftId={DRAFT} placementId="p1" placementStatus="ACTIVE" initial={null}
      onConfirmed={onConfirmed} {...props}
    />,
  );
  const textarea = screen.getByLabelText('Evaluation') as HTMLTextAreaElement;
  return { onConfirmed, textarea };
}

const type = (textarea: HTMLTextAreaElement, value: string) => fireEvent.change(textarea, { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('EvaluationEditor: idempotent creation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });

  it('sends the draft id as the create key, and a retry after a timeout reuses exactly that key', async () => {
    api.createMentorEvaluation.mockRejectedValueOnce(unknown()).mockResolvedValueOnce(evaluation());
    const { textarea, onConfirmed } = renderNew();
    type(textarea, 'Draft text');
    click('Save draft');
    expect(await screen.findByText(/Trying again is safe/)).toBeTruthy();
    click('Try again'); // available at once: a create retry can never create twice
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.createMentorEvaluation).toHaveBeenNthCalledWith(1, 'p1', DRAFT, 'Draft text');
    expect(api.createMentorEvaluation).toHaveBeenNthCalledWith(2, 'p1', DRAFT, 'Draft text');
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: CREATED }));
    expect(stored({ clientDraftId: DRAFT })).toBeNull();
  });

  it('after a timeout where the create had succeeded, a list refresh recognises it by its key (no second create)', async () => {
    api.createMentorEvaluation.mockRejectedValue(unknown());
    const refreshed = deferred<MentorEvaluation[] | undefined>();
    const onCreateUncertain = vi.fn(() => refreshed.promise);
    const { textarea, onConfirmed } = renderNew({ onCreateUncertain });
    type(textarea, 'Draft text');
    click('Save draft');
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh the list' }));
    // Nothing definite is said before the refresh has finished.
    expect(screen.queryByText(/The list was refreshed/)).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
    await act(async () => { refreshed.resolve([evaluation({ id: 'other', clientRequestId: 'another-key' }), evaluation()]); });
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.createMentorEvaluation).toHaveBeenCalledTimes(1);
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: CREATED }));
  });

  it('says the draft is not in the refreshed list only after the refresh, keeping the key for a safe retry', async () => {
    api.createMentorEvaluation.mockRejectedValueOnce(unknown()).mockResolvedValueOnce(evaluation());
    const onCreateUncertain = vi.fn(async () => [evaluation({ id: 'other', clientRequestId: 'another-key' })]);
    const { textarea } = renderNew({ onCreateUncertain });
    type(textarea, 'Draft text');
    click('Save draft');
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh the list' }));
    expect(await screen.findByText(/The list was refreshed and this draft is not in it yet/)).toBeTruthy();
    click('Try again');
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.createMentorEvaluation).toHaveBeenLastCalledWith('p1', DRAFT, 'Draft text');
    expect(stored({ clientDraftId: DRAFT })).toBeNull();
  });

  it('a failed list refresh is reported as unconfirmed (never as success or failure)', async () => {
    api.createMentorEvaluation.mockRejectedValue(unknown());
    const { textarea } = renderNew({ onCreateUncertain: async () => undefined });
    type(textarea, 'Draft text');
    click('Save draft');
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh the list' }));
    expect(await screen.findByText(/The list could not be refreshed/)).toBeTruthy();
    expect(stored({ clientDraftId: DRAFT })?.text).toBe('Draft text');
  });

  it('a recovered draft with edited text continues on the evaluation its earlier request created', async () => {
    // The copy of an earlier session: the create had succeeded, the answer was lost.
    writeBackup({
      version: 1, userId: USER, placementId: 'p1', evaluationId: null, clientDraftId: DRAFT, baseRevision: null,
      baseContent: null, text: 'Draft text, edited after recovery', updatedAt: '2026-10-18T10:05:00Z', writeId: 'w-old',
    });
    api.createMentorEvaluation.mockRejectedValue(new EvaluationRequestError({
      outcome: 'not-applied', status: 409, code: 'EVALUATION_CREATE_KEY_REUSED', evaluationId: CREATED,
    }));
    api.getMentorEvaluation.mockResolvedValue(evaluation());
    const { textarea, onConfirmed } = renderNew();
    expect(textarea.value).toBe('Draft text, edited after recovery');
    click('Save draft');
    expect(await screen.findByText(/already been saved by an earlier attempt, so no second copy was created/)).toBeTruthy();
    expect(api.createMentorEvaluation).toHaveBeenCalledWith('p1', DRAFT, 'Draft text, edited after recovery');
    expect(api.getMentorEvaluation).toHaveBeenCalledWith(CREATED);
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: CREATED }));
    // The text is kept, unsaved, now backed up for the existing evaluation.
    expect(textarea.value).toBe('Draft text, edited after recovery');
    expect(stored({ evaluationId: CREATED })).toMatchObject({ text: 'Draft text, edited after recovery', baseRevision: 1 });
    expect(stored({ clientDraftId: DRAFT })).toBeNull();

    api.saveMentorEvaluation.mockResolvedValue(evaluation({ content: 'Draft text, edited after recovery', revision: 2 }));
    click('Save draft');
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.saveMentorEvaluation).toHaveBeenCalledWith(CREATED, 'Draft text, edited after recovery', 1);
    expect(api.createMentorEvaluation).toHaveBeenCalledTimes(1);
  });

  it('a reused key without a usable evaluation is a clear failure that keeps the text', async () => {
    api.createMentorEvaluation.mockRejectedValue(new EvaluationRequestError({
      outcome: 'not-applied', status: 409, code: 'EVALUATION_CREATE_KEY_REUSED',
    }));
    const { textarea } = renderNew();
    type(textarea, 'Text');
    click('Save draft');
    expect((await screen.findByRole('alert')).textContent).toContain('Copy your text and start a new evaluation');
    expect(textarea.value).toBe('Text');
    expect(stored({ clientDraftId: DRAFT })?.text).toBe('Text');
  });

  it('asks the page to refresh when the placement is no longer active, keeping the text', async () => {
    api.createMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', status: 409, code: 'PLACEMENT_NOT_ACTIVE' }));
    const onStaleState = vi.fn();
    const { textarea } = renderNew({ onStaleState });
    type(textarea, 'Text');
    click('Save draft');
    expect((await screen.findByRole('alert')).textContent).toContain('read-only');
    expect(onStaleState).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe('Text');
  });

  it('removes a leftover copy identical to the server text, but never a different one', () => {
    const existing = evaluation({ id: 'e5', content: 'Saved', revision: 3, clientRequestId: null });
    writeBackup({
      version: 1, userId: USER, placementId: 'p1', evaluationId: 'e5', clientDraftId: null, baseRevision: 2,
      baseContent: 'Old', text: 'Saved', updatedAt: 'x', writeId: 'w-leftover',
    });
    writeBackup({
      version: 1, userId: USER, placementId: 'p1', evaluationId: 'e6', clientDraftId: null, baseRevision: 1,
      baseContent: 'Base', text: 'Unsaved other', updatedAt: 'x', writeId: 'w-other',
    });
    render(<EvaluationEditor userId={USER} clientDraftId={DRAFT} placementId="p1" placementStatus="ACTIVE" initial={existing} />);
    expect(stored({ evaluationId: 'e5' })).toBeNull();
    expect(stored({ evaluationId: 'e6' })?.text).toBe('Unsaved other');
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Saved');
  });

  it('shows the publisher of the visible version next to the publication date', () => {
    render(
      <EvaluationEditor
        userId={USER} clientDraftId={DRAFT} placementId="p1" placementStatus="ACTIVE"
        initial={evaluation({
          publicationState: 'PUBLISHED', revision: 3,
          published: { content: 'Draft text', revision: 3, publishedAt: '2026-10-18T11:00:00Z', firstPublishedAt: '2026-10-18T11:00:00Z',
            publishedByCurrentUser: false, publishedByName: 'Mentor Two' },
        })}
      />,
    );
    const panel = screen.getByRole('region', { name: 'Published version' });
    expect(panel.textContent).toContain('by Mentor Two');
  });

  it('a legacy draft id is never sent: the text is kept and a new key is used only after an explicit choice', async () => {
    writeBackup({
      version: 1, userId: USER, placementId: 'p1', evaluationId: null, clientDraftId: 'draft-legacy', baseRevision: null,
      baseContent: null, text: 'Old draft text', updatedAt: '2026-10-01T10:00:00Z', writeId: 'w-legacy',
    });
    api.createMentorEvaluation.mockResolvedValue(evaluation({ content: 'Old draft text' }));
    const onDraftIdChange = vi.fn();
    render(
      <EvaluationEditor userId={USER} clientDraftId="draft-legacy" placementId="p1" placementStatus="ACTIVE" initial={null}
        onDraftIdChange={onDraftIdChange} />,
    );
    const textarea = screen.getByLabelText('Evaluation') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Old draft text');
    expect(screen.getByText(/kept by an older version of the portal/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.createMentorEvaluation).not.toHaveBeenCalled();

    click('Save as a new draft…');
    click('Cancel');
    expect(stored({ clientDraftId: 'draft-legacy' })?.text).toBe('Old draft text'); // nothing changed
    click('Save as a new draft…');
    click('Yes, as a new draft');
    const newId = onDraftIdChange.mock.calls[0]?.[0] as string;
    expect(newId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stored({ clientDraftId: newId })?.text).toBe('Old draft text');
    expect(stored({ clientDraftId: 'draft-legacy' })).toBeNull();
    expect(api.createMentorEvaluation).not.toHaveBeenCalled(); // nothing is sent until the Mentor saves

    click('Save draft');
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.createMentorEvaluation).toHaveBeenCalledWith('p1', newId, 'Old draft text');
  });

  it('a valid draft id keeps its key: no legacy notice', () => {
    renderNew();
    expect(screen.queryByText(/kept by an older version of the portal/)).toBeNull();
  });
});
