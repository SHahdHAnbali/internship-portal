// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const placements = vi.hoisted(() => ({ getMyMentorPlacements: vi.fn() }));
vi.mock('@/features/mentor/services/mentor-placements.service', () => placements);
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'mentor-1' } }) }));

import { writeBackup } from '@/features/evaluations/local-backup';
import MentorEvaluations from './MentorEvaluations';

const active = {
  placementId: 'p1', internName: 'Intern One', internEmail: null, company: 'Acme', department: null,
  startDate: '2026-09-01', endDate: '2026-12-01', status: 'ACTIVE', trainingTitle: 'Engineering', reportsAwaitingReview: 0,
};

function copyFor(placementId: string, userId = 'mentor-1') {
  writeBackup({
    version: 1, userId, placementId, evaluationId: null, clientDraftId: `0f8e3b52-4a3c-4d7e-9b1a-${placementId.padStart(12, '0')}`,
    baseRevision: null, baseContent: null, text: 'Unsaved', updatedAt: 'x', writeId: `w-${placementId}`,
  });
}

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><MentorEvaluations /></MemoryRouter></QueryClientProvider>);
}

describe('MentorEvaluations overview', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });

  it('links unsaved text of a placement that can no longer be opened, without showing its text', async () => {
    placements.getMyMentorPlacements.mockResolvedValue([active]);
    copyFor('p1');
    copyFor('p-gone');
    copyFor('p-other-user', 'mentor-2');
    renderOverview();
    const section = await screen.findByRole('region', { name: 'Unsaved text for other placements' });
    const links = Array.from(section.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/mentor/evaluations/p-gone']);
    expect(section.textContent).not.toContain('Unsaved\n');
    expect(screen.getByText(/Unsaved evaluation text is kept in this browser tab/)).toBeTruthy(); // the p1 card
  });

  it('shows no such section without unreachable copies', async () => {
    placements.getMyMentorPlacements.mockResolvedValue([active]);
    renderOverview();
    expect(await screen.findByText('Intern One')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Unsaved text for other placements' })).toBeNull();
  });
});
