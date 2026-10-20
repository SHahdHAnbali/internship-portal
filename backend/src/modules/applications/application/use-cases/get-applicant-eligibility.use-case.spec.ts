import { GetApplicantEligibilityUseCase } from './get-applicant-eligibility.use-case.js';

function setup(alreadyApplied: boolean | Error) {
  const repository = {
    hasSubmittedApplication: vi.fn(async () => {
      if (alreadyApplied instanceof Error) throw alreadyApplied;
      return alreadyApplied;
    }),
  };
  return { useCase: new GetApplicantEligibilityUseCase(repository as never), repository };
}

describe('GetApplicantEligibilityUseCase', () => {
  it('says an applicant or intern with a submitted application cannot apply again', async () => {
    const { useCase, repository } = setup(true);
    await expect(useCase.execute({ id: 'auth-id', email: ' Intern@Example.com ' })).resolves.toEqual({ canApply: false });
    expect(repository.hasSubmittedApplication).toHaveBeenCalledWith({ authUserId: 'auth-id', email: 'intern@example.com' });
  });

  it('lets a user with no submitted application apply', async () => {
    const { useCase } = setup(false);
    await expect(useCase.execute({ id: 'auth-id', email: null })).resolves.toEqual({ canApply: true });
  });

  it('fails instead of answering "can apply" when the check fails', async () => {
    const { useCase } = setup(new Error('Unable to check for an earlier application'));
    await expect(useCase.execute({ id: 'auth-id', email: 'a@example.com' })).rejects.toThrow(/Unable to check/);
  });
});
