import { ActivateInternPlacementUseCase } from './activate-intern-placement.use-case.js';

describe('ActivateInternPlacementUseCase', () => {
  it('delegates with the authenticated actor and requested placement', async () => {
    const response = { id: 'placement-id', status: 'ACTIVE' };
    const activate = vi.fn().mockResolvedValue(response);
    const useCase = new ActivateInternPlacementUseCase({ activate } as never);

    await expect(useCase.execute('verified-hr-id', 'placement-id'))
      .resolves.toBe(response);
    expect(activate).toHaveBeenCalledWith('verified-hr-id', 'placement-id');
  });
});
