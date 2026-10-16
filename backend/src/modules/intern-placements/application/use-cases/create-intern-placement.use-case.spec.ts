import { BadRequestException } from '@nestjs/common';
import { CreateInternPlacementUseCase } from './create-intern-placement.use-case.js';

describe('CreateInternPlacementUseCase', () => {
  it('trims company and normalizes blank department before calling the repository', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'placement-id' });
    const useCase = new CreateInternPlacementUseCase({ create } as never);

    await useCase.execute({
      actorProfileId: 'hr-id',
      applicationId: 'application-id',
      company: ' \t\u00a0Example Company\ufeff ',
      department: '\t\u00a0\n',
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    });

    expect(create).toHaveBeenCalledWith({
      actorProfileId: 'hr-id',
      applicationId: 'application-id',
      company: 'Example Company',
      department: null,
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    });
  });

  it.each([
    ['   ', '2027-01-10', '2027-04-10'],
    ['\t\n\r', '2027-01-10', '2027-04-10'],
    ['\u00a0\ufeff', '2027-01-10', '2027-04-10'],
    ['Company', '2027-02-30', '2027-04-10'],
    ['Company', '2027-04-10', '2027-01-10'],
  ])('rejects invalid company/date input', (company, startDate, endDate) => {
    const create = vi.fn();
    const useCase = new CreateInternPlacementUseCase({ create } as never);

    expect(() => useCase.execute({
      actorProfileId: 'hr-id',
      applicationId: 'application-id',
      company,
      startDate,
      endDate,
    })).toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
