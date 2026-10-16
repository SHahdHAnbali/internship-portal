// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationDetails } from '@/features/applications/types';

const api = vi.hoisted(() => ({ releaseApplicationSelection: vi.fn() }));
vi.mock('@/features/applications/services/applications.service', () => api);

import SelectionReleaseCard from './SelectionReleaseCard';

const base = {
  id: 'application-id', status: 'SELECTED', selectionRelease: null, canReleaseSelection: true,
} as unknown as ApplicationDetails;

function renderCard(application: ApplicationDetails) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SelectionReleaseCard application={application} /></QueryClientProvider>);
}

describe('SelectionReleaseCard', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('is hidden when the selection cannot be released (e.g. a placement is open or completed)', () => {
    const { container } = renderCard({ ...base, canReleaseSelection: false });
    expect(container.textContent).toBe('');
  });

  it('requires a reason and sends nothing when cancelled', async () => {
    renderCard(base);
    fireEvent.click(screen.getByRole('button', { name: 'Release selection' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Release selection' }));
    expect(await within(dialog).findByText('A reason is required.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.releaseApplicationSelection).not.toHaveBeenCalled();
  });

  it('releases with the reason and shows a server refusal without claiming success', async () => {
    api.releaseApplicationSelection.mockRejectedValueOnce(new Error('This selection has already been released.'));
    renderCard(base);
    fireEvent.click(screen.getByRole('button', { name: 'Release selection' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Declined offer ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Release selection' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(api.releaseApplicationSelection).toHaveBeenCalledWith('application-id', 'Declined offer');
  });

  it('shows a recorded release as final', () => {
    renderCard({
      ...base, canReleaseSelection: false,
      selectionRelease: { releasedAt: '2026-10-14T10:00:00Z', reason: 'Declined offer', releasedBy: 'HR Person' },
    });
    expect(screen.getByText('Selection released — seat freed')).toBeTruthy();
    expect(screen.getByText('Reason: Declined offer')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release selection' })).toBeNull();
  });
});
