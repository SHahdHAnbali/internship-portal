// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MentorEvaluation } from '@/features/evaluations/types';

const api = vi.hoisted(() => ({
  listMentorEvaluations: vi.fn(),
  createMentorEvaluation: vi.fn(),
  saveMentorEvaluation: vi.fn(),
  publishMentorEvaluation: vi.fn(),
  getMentorEvaluation: vi.fn(),
}));
vi.mock('@/features/evaluations/evaluations.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/evaluations/evaluations.service')>()),
  ...api,
}));
const placements = vi.hoisted(() => ({ getMyMentorPlacements: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'mentor-1' } }) }));
vi.mock('@/features/mentor/services/mentor-placements.service', () => placements);

import { EvaluationRequestError } from '@/features/evaluations/evaluations.service';
import { writeBackup } from '@/features/evaluations/local-backup';
import { setSignedInUserId } from '@/lib/auth-identity';
import PlacementEvaluations from './PlacementEvaluations';

function evaluation(id: string, content: string, overrides: Partial<MentorEvaluation> = {}): MentorEvaluation {
  return {
    id, placementId: 'p1', placementStatus: 'ACTIVE', readOnly: false, content, publicationState: 'DRAFT', revision: 1,
    published: null, authorName: 'Mentor', lastEditorName: 'Mentor', clientRequestId: null, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
    ...overrides,
  };
}

function placement(status: 'ACTIVE' | 'COMPLETED') {
  return {
    placementId: 'p1', internName: 'Intern One', internEmail: null, company: 'Example Co', department: null,
    startDate: '2026-09-01', endDate: '2026-12-01', status, trainingTitle: 'Engineering', reportsAwaitingReview: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const textarea = () => screen.getByLabelText('Evaluation') as HTMLTextAreaElement;

let client: QueryClient;

function renderPage() {
  client = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/mentor/evaluations/:placementId', element: <PlacementEvaluations /> },
    { path: '/mentor/evaluations', element: <p>Placement overview</p> },
  ], { initialEntries: ['/mentor/evaluations/p1'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

describe('PlacementEvaluations', () => {
  beforeEach(() => {
    setSignedInUserId('mentor-1'); // as AuthProvider records it
    placements.getMyMentorPlacements.mockResolvedValue([placement('ACTIVE')]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'First text'), evaluation('e2', 'Second text')]);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); client = undefined as unknown as QueryClient; });

  it('asks before leaving the page with unsaved text, and stays when asked', async () => {
    const router = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    const textarea = screen.getByLabelText('Evaluation') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Unsaved edit' } });

    fireEvent.click(screen.getByRole('link', { name: /All placements/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Leave without saving?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/mentor/evaluations/p1');
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Unsaved edit');
  });

  it('leaves without asking when nothing is unsaved', async () => {
    const router = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.click(screen.getByRole('link', { name: /All placements/ }));
    expect(await screen.findByText('Placement overview')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/mentor/evaluations');
  });

  it('asks before switching to another evaluation with unsaved text', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(screen.getByLabelText('Evaluation'), { target: { value: 'Unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: /Evaluation 2/ }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Unsaved edit');

    fireEvent.click(screen.getByRole('button', { name: /Evaluation 2/ }));
    const switchDialog = await screen.findByRole('dialog');
    expect(switchDialog.textContent).toContain('has not been saved on the server');
    fireEvent.click(within(switchDialog).getByRole('button', { name: 'Switch (keep local copy)' }));
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Second text');

    // Switching kept the local copy: it is marked in the list and recovered on reopening.
    const first = screen.getByRole('button', { name: /Evaluation 1/ });
    expect(first.textContent).toContain('Unsaved local text in this tab');
    fireEvent.click(first);
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Unsaved edit');
    expect(screen.getByText('Recovered local, unsaved text')).toBeTruthy();
    expect(api.saveMentorEvaluation).not.toHaveBeenCalled();
  });

  it('offers to recover an unsaved new evaluation kept in this tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New evaluation/ }));
    fireEvent.change(screen.getByLabelText('Evaluation'), { target: { value: 'Brand new text' } });
    fireEvent.click(screen.getByRole('button', { name: /Evaluation 1/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch (keep local copy)' }));

    fireEvent.click(screen.getByRole('button', { name: /Unsaved new evaluation/ }));
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).value).toBe('Brand new text');
    expect(screen.getByText('New evaluation — not saved yet')).toBeTruthy();
    expect(api.createMentorEvaluation).not.toHaveBeenCalled();
  });

  it('does not offer a new evaluation on a completed placement', async () => {
    placements.getMyMentorPlacements.mockResolvedValue([placement('COMPLETED')]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'Final text', { placementStatus: 'COMPLETED', readOnly: true })]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    expect(screen.queryByRole('button', { name: /New evaluation/ })).toBeNull();
    expect((screen.getByLabelText('Evaluation') as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('shows an access error without database details', async () => {
    const { EvaluationRequestError } = await import('@/features/evaluations/evaluations.service');
    api.listMentorEvaluations.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', status: 403, code: 'EVALUATION_ACCESS_DENIED' }));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('You no longer have access to evaluations for this placement.');
  });
});

describe('PlacementEvaluations: cached data, late confirmations, completed placements', () => {
  beforeEach(() => {
    setSignedInUserId('mentor-1'); // as AuthProvider records it
    placements.getMyMentorPlacements.mockResolvedValue([placement('ACTIVE')]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'First text'), evaluation('e2', 'Second text')]);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); client = undefined as unknown as QueryClient; });

  for (const [status, code] of [[403, 'EVALUATION_ACCESS_DENIED'], [404, 'PLACEMENT_NOT_FOUND']] as const) {
    it(`stops showing earlier evaluations (and the editor) after a ${status} on reload`, async () => {
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
      expect(textarea().value).toBe('First text');
      api.listMentorEvaluations.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'not-applied', status, code }));
      await act(async () => { await client.refetchQueries(); });
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Evaluation 1/ })).toBeNull();
      expect(screen.queryByLabelText('Evaluation')).toBeNull();
      expect(screen.queryByText('First text')).toBeNull();
    });
  }

  it('after a 403 closes the editor, leaving needs no confirmation and the local copy stays', async () => {
    const router = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Unsaved edit' } });
    api.listMentorEvaluations.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'not-applied', status: 403, code: 'EVALUATION_ACCESS_DENIED' }));
    await act(async () => { await client.refetchQueries(); });
    await screen.findByRole('alert');
    const warn = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(warn);
    expect(warn.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: /All placements/ }));
    expect(await screen.findByText('Placement overview')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/mentor/evaluations');
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(sessionStorage.key(0) as string)).toContain('Unsaved edit');
  });

  it('while the editor is shown, unsaved text still arms the browser warning', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Unsaved edit' } });
    const warn = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(warn);
    expect(warn.defaultPrevented).toBe(true);
  });

  for (const code of ['SESSION_RENEWED', 'IDENTITY_MISMATCH'] as const) {
    it(`keeps the editor and its text when a reload is refused with ${code} (not a loss of access)`, async () => {
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
      fireEvent.change(textarea(), { target: { value: 'Unsaved edit' } });
      api.listMentorEvaluations.mockRejectedValueOnce(new EvaluationRequestError({
        outcome: 'not-applied', status: code === 'SESSION_RENEWED' ? 401 : null, code,
      }));
      await act(async () => { await client.refetchQueries(); });
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(textarea().value).toBe('Unsaved edit');
      expect(screen.queryByRole('region', { name: 'Unsaved local text' })).toBeNull();
      expect(api.listMentorEvaluations).toHaveBeenCalledTimes(2); // no automatic retry
    });
  }

  it('keeps the list and the editor text after a reload with an unknown outcome (network failure)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Unsaved edit' } });
    api.listMentorEvaluations.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'unknown' }));
    await act(async () => { await client.refetchQueries(); });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    expect(textarea().value).toBe('Unsaved edit');
  });

  it('never shows evaluations cached under another user\'s (or an unscoped) key', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['mentor', 'mentor-2', 'evaluations', 'p1'], [evaluation('x', 'Another Mentor\'s draft')]);
    client.setQueryData(['mentor', 'evaluations', 'p1'], [evaluation('y', 'Unscoped cached draft')]);
    client.setQueryData(['mentor', 'placements'], [{ ...placement('ACTIVE'), internName: 'Cached intern' }]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'Mine')]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    expect(textarea().value).toBe('Mine');
    expect(screen.queryAllByRole('button', { name: /Evaluation 2/ })).toHaveLength(0);
    expect(screen.queryByText(/Cached intern/)).toBeNull();
    expect(api.listMentorEvaluations).toHaveBeenCalledTimes(1);
    expect(placements.getMyMentorPlacements).toHaveBeenCalledTimes(1);
  });

  it('a late confirmation of editor A does not change the selection after the Mentor opened B', async () => {
    const pending = deferred<MentorEvaluation>();
    api.saveMentorEvaluation.mockReturnValue(pending.promise);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'A text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: /Evaluation 2/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Switch/ }));
    expect(textarea().value).toBe('Second text');

    await act(async () => { pending.resolve(evaluation('e1', 'A text', { revision: 2 })); });
    expect(screen.getByRole('button', { name: /Evaluation 2/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /Evaluation 1/ }).getAttribute('aria-current')).toBeNull();
    expect(textarea().value).toBe('Second text');
    // The confirmed result still updates the list for when A is reopened.
    fireEvent.click(screen.getByRole('button', { name: /Evaluation 1/ }));
    expect(textarea().value).toBe('A text');
    expect(screen.queryByText('Recovered local, unsaved text')).toBeNull();
  });

  it('offers an unsaved new draft of a completed placement read-only: copy or discard, never save', async () => {
    placements.getMyMentorPlacements.mockResolvedValue([placement('COMPLETED')]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'Final text', { placementStatus: 'COMPLETED', readOnly: true })]);
    writeBackup({
      version: 1, userId: 'mentor-1', placementId: 'p1', evaluationId: null, clientDraftId: 'd-old',
      baseRevision: null, baseContent: null, text: 'Draft written before completion', updatedAt: '2026-10-18T09:00:00Z', writeId: 'w-old',
    });
    renderPage();
    expect(await screen.findByRole('button', { name: /New evaluation/ }).catch(() => null)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Unsaved new evaluation \(read-only: placement completed\)/ }));
    expect(textarea().value).toBe('Draft written before completion');
    expect(textarea().readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Re)?publish$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Copy text/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Discard unsaved text/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }));
    expect(sessionStorage.length).toBe(0);
    expect(api.createMentorEvaluation).not.toHaveBeenCalled();
  });
});

describe('PlacementEvaluations: recovery after access loss, stale placements, late answers', () => {
  beforeEach(() => {
    setSignedInUserId('mentor-1');
    placements.getMyMentorPlacements.mockResolvedValue([placement('ACTIVE')]);
    api.listMentorEvaluations.mockResolvedValue([evaluation('e1', 'First text'), evaluation('e2', 'Second text')]);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); client = undefined as unknown as QueryClient; });

  it('after access is lost, the unsaved text stays readable from this tab only and can be discarded', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Text written before reassignment' } });
    api.listMentorEvaluations.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'not-applied', status: 404, code: 'PLACEMENT_NOT_FOUND' }));
    await act(async () => { await client.refetchQueries(); });
    const panel = await screen.findByRole('region', { name: 'Unsaved local text' });
    expect((within(panel).getByLabelText('Unsaved local text') as HTMLTextAreaElement).value).toBe('Text written before reassignment');
    expect((within(panel).getByLabelText('Unsaved local text') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(panel.textContent).toContain('has not been saved on the server');
    const calls = api.listMentorEvaluations.mock.calls.length;
    fireEvent.click(within(panel).getByRole('button', { name: /Discard/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Yes, discard' }));
    expect(screen.queryByRole('region', { name: 'Unsaved local text' })).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(api.listMentorEvaluations.mock.calls.length).toBe(calls); // nothing read or written on the server
    expect(api.saveMentorEvaluation).not.toHaveBeenCalled();
  });

  it('when a save finds the placement completed, the page refreshes and the editor becomes read-only, keeping the text', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Late edit' } });
    api.saveMentorEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', status: 409, code: 'PLACEMENT_NOT_ACTIVE' }));
    placements.getMyMentorPlacements.mockResolvedValue([placement('COMPLETED')]);
    api.listMentorEvaluations.mockResolvedValue([
      evaluation('e1', 'First text', { placementStatus: 'COMPLETED', readOnly: true }),
      evaluation('e2', 'Second text', { placementStatus: 'COMPLETED', readOnly: true }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(textarea().readOnly).toBe(true));
    expect(textarea().value).toBe('Late edit');
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: /New evaluation/ })).toBeNull();
  });

  it('a late confirmation after the signed-in user changed touches neither the cache nor the page', async () => {
    let answer!: (value: MentorEvaluation) => void;
    api.saveMentorEvaluation.mockReturnValue(new Promise<MentorEvaluation>((resolve) => { answer = resolve; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'A text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    setSignedInUserId('mentor-2'); // another account signed in (the guard would unmount the page)
    await act(async () => { answer(evaluation('e1', 'A text', { revision: 2 })); });
    const rows = client.getQueryData<MentorEvaluation[]>(['mentor', 'mentor-1', 'evaluations', 'p1']);
    expect(rows?.find((row) => row.id === 'e1')?.content).toBe('First text');
  });

  it('the leave warning also sets returnValue for older browsers', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Evaluation 1/ }));
    fireEvent.change(textarea(), { target: { value: 'Unsaved edit' } });
    const warn = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    let returnValue: unknown;
    Object.defineProperty(warn, 'returnValue', { set: (value) => { returnValue = value; }, get: () => returnValue });
    window.dispatchEvent(warn);
    expect(warn.defaultPrevented).toBe(true);
    expect(returnValue).toBe('');
  });
});
