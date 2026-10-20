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
import EvaluationEditor from './EvaluationEditor';

function evaluation(overrides: Partial<MentorEvaluation> = {}): MentorEvaluation {
  return {
    id: 'e1', placementId: 'p1', placementStatus: 'ACTIVE', readOnly: false, content: 'Saved text',
    publicationState: 'DRAFT', revision: 2, published: null, authorName: 'Mentor One', lastEditorName: 'Mentor One', clientRequestId: null,
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const notApplied = (code: string, extra: { status?: number; currentRevision?: number } = {}) =>
  new EvaluationRequestError({ outcome: 'not-applied', code, ...extra });

function renderEditor(initial: MentorEvaluation | null = evaluation(), props: Partial<Parameters<typeof EvaluationEditor>[0]> = {}) {
  const onConfirmed = vi.fn();
  const onDirtyChange = vi.fn();
  render(
    <EvaluationEditor
      userId="mentor-1"
      clientDraftId="9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
      placementId="p1"
      placementStatus={initial?.placementStatus ?? 'ACTIVE'}
      initial={initial}
      onConfirmed={onConfirmed}
      onDirtyChange={onDirtyChange}
      {...props}
    />,
  );
  return { onConfirmed, onDirtyChange, textarea: screen.getByLabelText('Evaluation') as HTMLTextAreaElement };
}

const type = (textarea: HTMLTextAreaElement, value: string) => fireEvent.change(textarea, { target: { value } });

describe('EvaluationEditor', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });

  it('keeps the text after a failed save and shows the error', async () => {
    api.saveMentorEvaluation.mockRejectedValue(notApplied('EVALUATION_CONCURRENT_UPDATE'));
    const { textarea } = renderEditor();
    type(textarea, 'My new text');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Your text is still in the editor.');
    expect(textarea.value).toBe('My new text');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('keeps text typed while a save is in flight, and stays dirty afterwards', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const { textarea, onConfirmed } = renderEditor();
    type(textarea, 'First part');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    type(textarea, 'First part and more');
    await act(async () => { pending.resolve(evaluation({ content: 'First part', revision: 3, publicationState: 'DRAFT' })); });
    expect(textarea.value).toBe('First part and more');
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('sends the confirmed revision and prevents duplicate submissions', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    const { textarea } = renderEditor();
    type(textarea, 'Changed');
    const save = screen.getByRole('button', { name: 'Save draft' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);
    expect(api.saveMentorEvaluation).toHaveBeenCalledWith('e1', 'Changed', 2);
    await act(async () => { pending.resolve(evaluation({ content: 'Changed', revision: 3 })); });
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('on a revision conflict keeps the text, never resubmits, and offers the four choices', async () => {
    api.saveMentorEvaluation.mockRejectedValue(notApplied('EVALUATION_REVISION_CONFLICT', { status: 409, currentRevision: 4 }));
    api.getMentorEvaluation.mockResolvedValue(evaluation({ content: 'Someone else’s text', revision: 4 }));
    const { textarea } = renderEditor();
    type(textarea, 'My text');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Copy my text/ })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: /View latest/ }));
    expect(await within(dialog).findByText('Someone else’s text')).toBeTruthy();
    expect(textarea.value).toBe('My text');

    // Replace needs a second confirmation.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace my text' }));
    expect(textarea.value).toBe('My text');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, replace my text' }));
    expect(textarea.value).toBe('Someone else’s text');
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);
  });

  it('"Keep my text" bases the next save on the latest revision only after the user saves again', async () => {
    api.saveMentorEvaluation.mockRejectedValueOnce(notApplied('EVALUATION_REVISION_CONFLICT', { status: 409, currentRevision: 4 }));
    api.getMentorEvaluation.mockResolvedValue(evaluation({ content: 'Other', revision: 4 }));
    const { textarea } = renderEditor();
    type(textarea, 'My text');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /View latest/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: /Keep my text and save it over this version/ }));
    expect(textarea.value).toBe('My text');
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);

    api.saveMentorEvaluation.mockResolvedValue(evaluation({ content: 'My text', revision: 5 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(api.saveMentorEvaluation).toHaveBeenLastCalledWith('e1', 'My text', 4);
  });

  it('keeps the text on HTTP 413 and explains the size limit', async () => {
    api.saveMentorEvaluation.mockRejectedValue(notApplied('REQUEST_TOO_LARGE', { status: 413 }));
    const { textarea } = renderEditor();
    type(textarea, 'Long text');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/larger than the server accepts/);
    expect(textarea.value).toBe('Long text');
  });

  it('disables publishing while there are unsaved changes', () => {
    const { textarea } = renderEditor();
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(false);
    type(textarea, 'Edited');
    expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the published snapshot separately from the saved working text', () => {
    renderEditor(evaluation({
      content: 'Newer saved draft', revision: 4, publicationState: 'UNPUBLISHED_CHANGES',
      published: { content: 'What the intern sees', revision: 3, publishedAt: '2026-10-03T10:00:00Z', firstPublishedAt: '2026-10-03T10:00:00Z', publishedByCurrentUser: true, publishedByName: 'Mentor One' },
    }));
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Newer saved draft');
    const published = screen.getByRole('region', { name: 'Published version' });
    expect(within(published).getByText('What the intern sees')).toBeTruthy();
    expect(screen.getByText('Unpublished changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Republish' })).toBeTruthy();
  });

  it('publishes the saved revision after confirmation', async () => {
    api.publishMentorEvaluation.mockResolvedValue(evaluation({ publicationState: 'PUBLISHED', revision: 3,
      published: { content: 'Saved text', revision: 3, publishedAt: 'x', firstPublishedAt: 'x', publishedByCurrentUser: true, publishedByName: 'Mentor One' } }));
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(api.publishMentorEvaluation).toHaveBeenCalledWith('e1', 2);
    const published = await screen.findByRole('region', { name: 'Published version' });
    expect(within(published).getByText('Saved text')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Republish' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('is read-only for a completed placement', () => {
    renderEditor(evaluation({ placementStatus: 'COMPLETED', readOnly: true, publicationState: 'PUBLISHED',
      published: { content: 'Saved text', revision: 2, publishedAt: 'x', firstPublishedAt: 'x', publishedByCurrentUser: true, publishedByName: 'Mentor One' } }));
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
    expect(screen.getByText('Published — placement completed')).toBeTruthy();
  });

  it('after an unknown outcome: no automatic retry; a check confirms success only on an exact match', async () => {
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'unknown' }));
    api.getMentorEvaluation.mockResolvedValue(evaluation({ content: 'Changed', revision: 3 }));
    const { textarea, onConfirmed } = renderEditor();
    type(textarea, 'Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/couldn’t confirm whether the evaluation was saved/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(api.saveMentorEvaluation).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Check whether it was saved' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
    expect(textarea.value).toBe('Changed');
  });

  it('after an unconfirmed check offers an explicit retry of the exact same attempt', async () => {
    api.saveMentorEvaluation.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'unknown' }));
    api.getMentorEvaluation.mockResolvedValue(evaluation({ content: 'Saved text', revision: 2 }));
    const { textarea } = renderEditor();
    type(textarea, 'Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check whether it was saved' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    type(textarea, 'Changed even more');
    api.saveMentorEvaluation.mockResolvedValue(evaluation({ content: 'Changed', revision: 3 }));
    fireEvent.click(retry);
    expect(api.saveMentorEvaluation).toHaveBeenLastCalledWith('e1', 'Changed', 2);
    expect(textarea.value).toBe('Changed even more');
  });

  it('creates a new evaluation on the first save', async () => {
    api.createMentorEvaluation.mockResolvedValue(evaluation({ content: 'First draft', revision: 1 }));
    const { textarea, onConfirmed } = renderEditor(null);
    expect(screen.getByText('New evaluation — not saved yet')).toBeTruthy();
    type(textarea, 'First draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(api.createMentorEvaluation).toHaveBeenCalledWith('p1', '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'First draft');
    expect(await screen.findByText('Draft')).toBeTruthy();
    expect(onConfirmed).toHaveBeenCalled();
  });
});
