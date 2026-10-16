import { GetApplicationInternPlacementUseCase } from './get-application-intern-placement.use-case.js';

describe('GetApplicationInternPlacementUseCase', () => {
  it('loads the placement overview for the requested application', async () => {
    const overview = { current: { id: 'placement-id' }, cancelled: [], history: [] };
    const getOverviewForApplication = vi.fn().mockResolvedValue(overview);
    const useCase = new GetApplicationInternPlacementUseCase({ getOverviewForApplication } as never);

    await expect(useCase.execute('application-id')).resolves.toBe(overview);
    expect(getOverviewForApplication).toHaveBeenCalledWith('application-id');
  });
});
