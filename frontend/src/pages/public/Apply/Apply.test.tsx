// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getApplicationIntake: vi.fn(),
  submitApplication: vi.fn(),
  getInternships: vi.fn(),
}));
vi.mock('@/features/applications/services/applications.service', () => ({
  getApplicationIntake: api.getApplicationIntake,
  submitApplication: api.submitApplication,
}));
vi.mock('@/features/internships/services/internships.service', () => ({ getInternships: api.getInternships }));

import Apply from './Apply';

function renderApply() {
  return render(<MemoryRouter><Apply /></MemoryRouter>);
}

describe('Apply page and portal intake', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a closed message and no form while applications are closed', async () => {
    api.getInternships.mockResolvedValue([{ id: 'i', title: 'Backend', isActive: true, createdAt: 'c' }]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: false });
    renderApply();
    expect(await screen.findByText('Applications are currently closed')).toBeTruthy();
    expect(screen.queryByText('Backend')).toBeNull();
    expect(api.submitApplication).not.toHaveBeenCalled();
  });

  it('shows the form, including the "Other" option, while applications are open', async () => {
    api.getInternships.mockResolvedValue([{ id: 'i', title: 'Backend', isActive: true, createdAt: 'c' }]);
    api.getApplicationIntake.mockResolvedValue({ applicationsOpen: true });
    renderApply();
    expect(await screen.findByText('Backend')).toBeTruthy();
    expect(screen.queryByText('Applications are currently closed')).toBeNull();
  });
});
