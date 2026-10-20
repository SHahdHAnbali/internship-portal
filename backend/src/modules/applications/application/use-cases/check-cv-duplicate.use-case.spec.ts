import { BadRequestException } from '@nestjs/common';

import { CheckCvDuplicateUseCase } from './check-cv-duplicate.use-case.js';

const HASH = 'ABCDEF'.padEnd(64, '0');

function setup(options: { submitted?: boolean | Error; uploadedBefore?: boolean | Error } = {}) {
  const answer = (value: boolean | Error | undefined) => async () => {
    if (value instanceof Error) throw value;
    return value ?? false;
  };
  const repository = {
    hasSubmittedApplicationForCv: vi.fn(answer(options.submitted)),
    hasPreviousUploadOfCv: vi.fn(answer(options.uploadedBefore)),
  };
  return { useCase: new CheckCvDuplicateUseCase(repository as never), repository };
}

describe('CheckCvDuplicateUseCase', () => {
  it('reports a CV already submitted with an application as a duplicate, whatever the training', async () => {
    const { useCase, repository } = setup({ submitted: true, uploadedBefore: true });
    for (const [internshipId, requested] of [['internship-id', null], ['other-internship-id', null], [null, 'Robotics'], [null, null]] as const) {
      await expect(useCase.execute(HASH, internshipId, requested)).resolves.toEqual({ duplicate: true, previouslyUploaded: true });
    }
    // Searched across every submitted application: no training or applicant filter.
    expect(repository.hasSubmittedApplicationForCv).toHaveBeenCalledWith(HASH.toLowerCase(), null);
    expect(repository.hasPreviousUploadOfCv).toHaveBeenCalledWith(HASH.toLowerCase(), null);
  });

  it('only warns about a CV that was uploaded before but never submitted (a draft)', async () => {
    const { useCase } = setup({ submitted: false, uploadedBefore: true });
    await expect(useCase.execute(HASH, 'internship-id', null)).resolves.toEqual({ duplicate: false, previouslyUploaded: true });
  });

  it('reports a genuinely new CV as neither', async () => {
    const { useCase } = setup({ submitted: false, uploadedBefore: false });
    await expect(useCase.execute(HASH, null, null)).resolves.toEqual({ duplicate: false, previouslyUploaded: false });
  });

  it('refuses two training targets at once', async () => {
    const { useCase, repository } = setup();
    const error = await useCase.execute(HASH, 'internship-id', 'Robotics').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('Choose either an available internship or another training area, not both.');
    expect(repository.hasPreviousUploadOfCv).not.toHaveBeenCalled();
    expect(repository.hasSubmittedApplicationForCv).not.toHaveBeenCalled();
  });

  it.each([
    ['the submitted-CV search', { submitted: new Error('Unable to check whether this CV was already submitted') }],
    ['the earlier-upload search', { uploadedBefore: new Error('Unable to check for an earlier upload of this CV') }],
  ])('fails (never answers "clear") when %s cannot be checked', async (_label, options) => {
    const { useCase } = setup(options);
    await expect(useCase.execute(HASH, 'internship-id', null)).rejects.toThrow(/Unable to check/);
  });

  it('returns only two yes/no answers (no applicant, training or application details)', async () => {
    const { useCase } = setup({ uploadedBefore: true });
    const result = await useCase.execute(HASH, 'internship-id', null);
    expect(Object.keys(result).sort()).toEqual(['duplicate', 'previouslyUploaded']);
  });
});
