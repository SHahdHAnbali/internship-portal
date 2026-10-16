import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInternPlacementDto } from './create-intern-placement.dto.js';

describe('CreateInternPlacementDto', () => {
  it('trims company and department and accepts date-only values', async () => {
    const dto = plainToInstance(CreateInternPlacementDto, {
      company: '  Example Company  ',
      department: '  Engineering  ',
      startDate: '2027-01-10',
      endDate: '2027-04-10',
    });

    expect(dto.company).toBe('Example Company');
    expect(dto.department).toBe('Engineering');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['   ', '\t\n\r', '\u00a0\ufeff'])(
    'rejects company containing only JavaScript-trim whitespace',
    async (company) => {
      const dto = plainToInstance(CreateInternPlacementDto, {
        company,
        startDate: '2027-01-10',
        endDate: '2027-04-10',
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('rejects non-date-only values', async () => {
    const dto = plainToInstance(CreateInternPlacementDto, {
      company: 'Example Company',
      startDate: '2027-01-10T12:00:00Z',
      endDate: '2027-04-10',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
