// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listMyEvaluations: vi.fn(), getMyEvaluation: vi.fn() }));
const auth = vi.hoisted(() => ({ userId: 'intern-1' }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: auth.userId } }) }));
vi.mock('@/features/evaluations/evaluations.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/evaluations/evaluations.service')>()),
  ...api,
}));

import InternEvaluationDetail from './InternEvaluationDetail';
import InternEvaluations from './InternEvaluations';

const published = {
  id: 'e1', placementId: 'p1', placementStatus: 'COMPLETED' as const, trainingTitle: 'Engineering', company: 'Example Co',
  content: 'نص التقييم المنشور\nPublished text', publishedAt: '2026-10-03T10:00:00Z', authorName: 'Mentor One', publishedByName: 'Mentor One',
};

function renderAt(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/intern/evaluations" element={<InternEvaluations />} />
          <Route path="/intern/evaluations/:evaluationId" element={<InternEvaluationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Intern evaluations', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('lists published evaluations grouped by placement, including completed placements', async () => {
    api.listMyEvaluations.mockResolvedValue([published]);
    renderAt('/intern/evaluations');
    expect(await screen.findByText('Engineering')).toBeTruthy();
    expect(screen.getByText('Placement completed')).toBeTruthy();
    expect(screen.getByText('Evaluation by Mentor One')).toBeTruthy();
    expect(screen.queryByText(/draft|revision|unpublished/i)).toBeNull();
  });

  it('shows the published text exactly, with automatic text direction, and no editing controls', async () => {
    api.getMyEvaluation.mockResolvedValue(published);
    renderAt('/intern/evaluations/e1');
    const text = await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === published.content);
    expect(text.getAttribute('dir')).toBe('auto');
    expect(api.getMyEvaluation).toHaveBeenCalledWith('e1');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /save|publish/i })).toBeNull();
  });

  it('never shows evaluations cached for another user (user-scoped query keys)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['intern', 'intern-2', 'evaluations'], [{ ...published, id: 'other', content: 'Another intern\'s evaluation' }]);
    client.setQueryData(['intern', 'evaluations'], [{ ...published, id: 'old-key', content: 'Unscoped cached evaluation' }]);
    api.listMyEvaluations.mockResolvedValue([]);
    renderAt('/intern/evaluations', client);
    expect(await screen.findByText('No evaluations yet')).toBeTruthy();
    expect(screen.queryByText(/Another intern|Unscoped cached/)).toBeNull();
    expect(api.listMyEvaluations).toHaveBeenCalledTimes(1);
  });

  it('shows the error state instead of earlier data when a reload is refused', async () => {
    const { EvaluationRequestError } = await import('@/features/evaluations/evaluations.service');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.listMyEvaluations.mockResolvedValueOnce([published]);
    renderAt('/intern/evaluations', client);
    expect(await screen.findByText('Engineering')).toBeTruthy();
    api.listMyEvaluations.mockRejectedValueOnce(new EvaluationRequestError({ outcome: 'not-applied', status: 403, code: 'EVALUATION_ACCESS_DENIED' }));
    await act(async () => { await client.refetchQueries(); });
    expect(await screen.findByText('Unable to load your evaluations')).toBeTruthy();
    expect(screen.queryByText('Engineering')).toBeNull();
  });

  it('names the publisher of the visible version when it is not the original author', async () => {
    api.getMyEvaluation.mockResolvedValue({ ...published, publishedByName: 'Mentor Two' });
    renderAt('/intern/evaluations/e1');
    expect(await screen.findByText('Evaluation by Mentor One')).toBeTruthy();
    expect(screen.getByText('Published by Mentor Two')).toBeTruthy();
  });

  it('does not repeat the name when the author published it', async () => {
    api.listMyEvaluations.mockResolvedValue([published]);
    renderAt('/intern/evaluations');
    expect(await screen.findByText('Evaluation by Mentor One')).toBeTruthy();
    expect(screen.queryByText(/Published by/)).toBeNull();
  });

  it('shows an empty state when nothing has been published', async () => {
    api.listMyEvaluations.mockResolvedValue([]);
    renderAt('/intern/evaluations');
    expect(await screen.findByText('No evaluations yet')).toBeTruthy();
  });

  it('shows a not-available message for an evaluation the intern cannot see', async () => {
    const { EvaluationRequestError } = await import('@/features/evaluations/evaluations.service');
    api.getMyEvaluation.mockRejectedValue(new EvaluationRequestError({ outcome: 'not-applied', status: 404, code: 'EVALUATION_NOT_FOUND' }));
    renderAt('/intern/evaluations/other');
    expect((await screen.findByRole('alert')).textContent).toBe('This evaluation is not available to you.');
  });
});
