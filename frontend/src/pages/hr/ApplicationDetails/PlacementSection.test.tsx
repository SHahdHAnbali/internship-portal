// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationDetails } from '@/features/applications/types';
import type { HrApplicationPlacementOverview, HrInternPlacement } from '@/features/hr/services/intern-placement.service';

const api = vi.hoisted(() => ({
  getHrApplicationPlacement: vi.fn(),
  getHrMentors: vi.fn(),
  activateHrInternPlacement: vi.fn(),
  cancelHrInternPlacement: vi.fn(),
  completeHrInternPlacement: vi.fn(),
  createHrInternPlacement: vi.fn(),
  assignHrPlacementMentor: vi.fn(),
  unassignHrPlacementMentor: vi.fn(),
}));
vi.mock('@/features/hr/services/intern-placement.service', () => api);
vi.mock('@/features/internships/services/internships.service', () => ({}));

import PlacementSection from './PlacementSection';

const application = { id: 'application-id' } as unknown as ApplicationDetails;

function placement(overrides: Partial<HrInternPlacement>): HrInternPlacement {
  return {
    id: 'placement-id', applicationId: 'application-id', applicantId: 'applicant-id', internshipId: 'internship-id',
    company: 'Example Co', department: null, startDate: '2099-01-01', endDate: '2099-03-01', status: 'SCHEDULED',
    mentorProfileId: null, cancelledAt: null, cancellationReason: null, completedAt: null, completionNote: null,
    endedEarly: null, createdAt: 'c', updatedAt: 'u',
    ...overrides,
  };
}

function overview(current: HrInternPlacement): HrApplicationPlacementOverview {
  return {
    current, cancelled: [], trainingTitle: 'Engineering', selectionStatus: 'OPEN', capacity: 3,
    seatsConsumed: 1, selectionReleased: false, history: [],
  };
}

const mentors = [
  { id: 'mentor-one', fullName: 'Mentor One', email: null, openPlacements: 1 },
  { id: 'mentor-two', fullName: 'Mentor Two', email: null, openPlacements: 0 },
];

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><PlacementSection application={application} /></QueryClientProvider>);
}

describe('PlacementSection: Mentor required for activation', () => {
  beforeEach(() => { api.getHrMentors.mockResolvedValue(mentors); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('disables activation without a Mentor and explains why', async () => {
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({})));
    renderSection();
    const activate = await screen.findByRole('button', { name: 'Activate placement' });
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    const explanation = screen.getByText('Assign a Mentor below before activating this placement.');
    expect(activate.getAttribute('aria-describedby')).toBe(explanation.id);
    fireEvent.click(activate);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.activateHrInternPlacement).not.toHaveBeenCalled();
  });

  it('allows activation once a Mentor is assigned', async () => {
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({ mentorProfileId: 'mentor-one' })));
    api.activateHrInternPlacement.mockResolvedValue(placement({ status: 'ACTIVE', mentorProfileId: 'mentor-one' }));
    renderSection();
    const activate = await screen.findByRole('button', { name: 'Activate placement' });
    expect((activate as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Assign a Mentor below before activating this placement.')).toBeNull();
    fireEvent.click(activate);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm activation' }));
    await waitFor(() => expect(api.activateHrInternPlacement).toHaveBeenCalledWith('placement-id'));
  });

  it('shows the server refusal (e.g. a deactivated Mentor) without claiming success', async () => {
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({ mentorProfileId: 'mentor-one' })));
    api.activateHrInternPlacement.mockRejectedValue(
      new Error('The assigned Mentor’s account is deactivated. Assign an active Mentor before activating the placement.'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Activate placement' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm activation' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Assign an active Mentor');
  });

  it('keeps the loading and error states of the placement', async () => {
    api.getHrApplicationPlacement.mockRejectedValue(new Error('Unable to load placement'));
    renderSection();
    expect(screen.getByText('Loading placement…')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load placement');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('PlacementMentorAssignment: removal versus replacement', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('lets HR remove the Mentor of a scheduled placement', async () => {
    api.getHrMentors.mockResolvedValue(mentors);
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({ mentorProfileId: 'mentor-one' })));
    api.unassignHrPlacementMentor.mockResolvedValue(placement({}));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Mentor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Mentor' }));
    await waitFor(() => expect(api.unassignHrPlacementMentor).toHaveBeenCalledWith('placement-id', null));
  });

  it('offers no removal for an active placement, only a replacement in one step', async () => {
    api.getHrMentors.mockResolvedValue(mentors);
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({ status: 'ACTIVE', mentorProfileId: 'mentor-one' })));
    api.assignHrPlacementMentor.mockResolvedValue(placement({ status: 'ACTIVE', mentorProfileId: 'mentor-two' }));
    renderSection();
    expect(await screen.findByText(/An active placement must always have a Mentor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Mentor' })).toBeNull();
    const select = await screen.findByRole('combobox', { name: 'Select placement Mentor' });
    fireEvent.change(select, { target: { value: 'mentor-two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Mentor' }));
    await waitFor(() => expect(api.assignHrPlacementMentor).toHaveBeenCalledWith('placement-id', 'mentor-two'));
    expect(api.unassignHrPlacementMentor).not.toHaveBeenCalled();
  });

  it('keeps the empty and error states of the Mentor list', async () => {
    api.getHrApplicationPlacement.mockResolvedValue(overview(placement({})));
    api.getHrMentors.mockResolvedValueOnce([]);
    renderSection();
    expect(await screen.findByText(/There are no active Mentor accounts yet/)).toBeTruthy();
    cleanup();

    api.getHrMentors.mockRejectedValueOnce(new Error('Unable to load Mentors'));
    renderSection();
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => node.textContent?.includes('Unable to load Mentors'))).toBe(true));
  });
});
