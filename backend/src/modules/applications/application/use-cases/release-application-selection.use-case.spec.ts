import { ReleaseApplicationSelectionUseCase } from './release-application-selection.use-case.js';

const releasedRow = {
  id: 'application-id', status: 'SELECTED',
  selection_released_at: '2026-10-14T10:00:00Z', selection_release_reason: 'Declined offer',
};

describe('ReleaseApplicationSelectionUseCase', () => {
  it('releases through the HR-scoped function with the verified actor and returns the kept status', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [releasedRow], error: null });
    const useCase = new ReleaseApplicationSelectionUseCase({ client: { rpc } } as never);
    await expect(useCase.execute('hr-id', 'application-id', 'Declined offer')).resolves.toEqual({
      id: 'application-id', status: 'SELECTED',
      selectionReleasedAt: '2026-10-14T10:00:00Z', selectionReleaseReason: 'Declined offer',
    });
    expect(rpc).toHaveBeenCalledWith('release_application_selection', {
      p_actor_profile_id: 'hr-id', p_application_id: 'application-id', p_reason: 'Declined offer',
    });
  });

  it.each([
    ['selection_already_released', 409, 'This selection has already been released.'],
    ['selection_not_releasable', 409, 'Only a selected application without a scheduled, active or completed placement can be released. Cancel a scheduled placement first.'],
    ['release_reason_required', 400, 'Give a reason for releasing this selection.'],
    ['application_not_found', 404, 'Application not found'],
  ])('maps %s', async (key, status, message) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: key } });
    await expect(new ReleaseApplicationSelectionUseCase({ client: { rpc } } as never).execute('hr', 'a', 'r'))
      .rejects.toMatchObject({ status, message });
  });

  it('maps a role refusal to 403 and rejects malformed results', async () => {
    const refused = { client: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ403', message: 'hr_role_required' } }) } };
    await expect(new ReleaseApplicationSelectionUseCase(refused as never).execute('x', 'a', 'r')).rejects.toMatchObject({ status: 403 });
    const malformed = { client: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } };
    await expect(new ReleaseApplicationSelectionUseCase(malformed as never).execute('x', 'a', 'r')).rejects.toMatchObject({ status: 500 });
  });
});
