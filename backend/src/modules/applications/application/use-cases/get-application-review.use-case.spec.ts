import { GoneException, NotFoundException } from '@nestjs/common';

import {
  GetApplicationReviewUseCase,
  REVIEW_LINK_EXPIRED,
  REVIEW_LINK_NOT_FOUND,
  REVIEW_LINK_USED,
} from './get-application-review.use-case.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

function setup(
  row: Record<string, unknown> | null,
  intakeOpen = true,
  hasSubmittedApplicationForCv: () => Promise<boolean> = async () => false,
  hasPreviousUploadOfCv: () => Promise<boolean> = async () => false,
  hasSubmittedApplication: () => Promise<boolean> = async () => false,
) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const from = vi.fn(() => query);
  const rpc = vi.fn(async () => ({ data: intakeOpen, error: null }));
  const repository = {
    hasSubmittedApplicationForCv: vi.fn(hasSubmittedApplicationForCv),
    hasPreviousUploadOfCv: vi.fn(hasPreviousUploadOfCv),
    hasSubmittedApplication: vi.fn(hasSubmittedApplication),
  };
  return {
    useCase: new GetApplicationReviewUseCase({ client: { from, rpc } } as never, repository as never),
    from,
    rpc,
    repository,
  };
}

const draft = {
  id: 'app-id',
  status: 'DRAFT',
  review_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  review_token_used_at: null,
  review_email: 'owner@example.com',
  extracted_data: { email: 'someone-else@example.com', fullName: 'Owner' },
  internship_id: 'int',
  requested_training: null,
  cv_sha256: 'a'.repeat(64),
  internships: { id: 'int', title: 'Engineering' },
};

describe('GetApplicationReviewUseCase', () => {
  describe('CV check before the final submission', () => {
    it('checks this draft\'s CV against submitted applications and earlier uploads (excluding itself)', async () => {
      const { useCase, repository } = setup(draft);
      await expect(useCase.execute(TOKEN)).resolves.toMatchObject({
        cvCheck: { status: 'checked', duplicate: false, previouslyUploaded: false },
      });
      expect(repository.hasSubmittedApplicationForCv).toHaveBeenCalledWith('a'.repeat(64), 'app-id');
      expect(repository.hasPreviousUploadOfCv).toHaveBeenCalledWith('a'.repeat(64), 'app-id');
    });

    it('only warns about a CV that was uploaded before but never submitted', async () => {
      const { useCase } = setup(draft, true, async () => false, async () => true);
      await expect(useCase.execute(TOKEN)).resolves.toMatchObject({
        cvCheck: { status: 'checked', duplicate: false, previouslyUploaded: true },
      });
    });

    it('refuses the review of a CV already submitted with another application (any training), before the one-application rule', async () => {
      const { useCase, repository } = setup(
        { ...draft, internship_id: null, internships: null, requested_training: ' Robotics ' }, true, async () => true, async () => true, async () => true);
      const error = await useCase.execute(TOKEN).catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ code: 'CV_ALREADY_SUBMITTED' });
      expect(JSON.stringify(error.getResponse())).not.toMatch(/@|app-id|Robotics/);
      expect(repository.hasSubmittedApplication).not.toHaveBeenCalled();
    });

    it('reports a draft without a stored fingerprint as not checkable (never as clear)', async () => {
      const { useCase, repository } = setup({ ...draft, cv_sha256: null });
      await expect(useCase.execute(TOKEN)).resolves.toMatchObject({ cvCheck: { status: 'unavailable' } });
      expect(repository.hasSubmittedApplicationForCv).not.toHaveBeenCalled();
      expect(repository.hasPreviousUploadOfCv).not.toHaveBeenCalled();
    });

    it.each([
      ['the submission rule', async () => { throw new Error('down'); }, async () => false],
      ['the earlier-upload search', async () => false, async () => { throw new Error('down'); }],
    ])('reports a failed check (not "clear") when %s fails', async (_label, active, previous) => {
      const { useCase } = setup(draft, true, active, previous);
      await expect(useCase.execute(TOKEN)).resolves.toMatchObject({ applicationId: 'app-id', cvCheck: { status: 'failed' } });
    });

    it('does not check links that cannot be reviewed', async () => {
      const { useCase, repository } = setup({ ...draft, status: 'NEW' });
      await expect(useCase.execute(TOKEN)).rejects.toBeInstanceOf(GoneException);
      expect(repository.hasSubmittedApplicationForCv).not.toHaveBeenCalled();
      expect(repository.hasPreviousUploadOfCv).not.toHaveBeenCalled();
    });
  });

  it('returns the draft with the fixed review email', async () => {
    const { useCase } = setup(draft);
    await expect(useCase.execute(TOKEN)).resolves.toMatchObject({
      applicationId: 'app-id',
      reviewEmail: 'owner@example.com',
      internship: { id: 'int', title: 'Engineering' },
      extractedData: { email: 'owner@example.com', fullName: 'Owner' },
    });
  });

  it('rejects a malformed token without querying', async () => {
    const { useCase, from } = setup(draft);
    await expect(useCase.execute('bad')).rejects.toMatchObject({
      response: expect.objectContaining({ code: REVIEW_LINK_NOT_FOUND }),
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('reports an unknown link as not found', async () => {
    const { useCase } = setup(null);
    const result = useCase.execute(TOKEN);
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    await expect(result).rejects.toMatchObject({ response: expect.objectContaining({ code: REVIEW_LINK_NOT_FOUND }) });
  });

  it.each([
    ['submitted', { ...draft, status: 'NEW' }],
    ['consumed', { ...draft, review_token_used_at: new Date().toISOString() }],
  ])('reports a %s link as already used (410)', async (_label, row) => {
    const { useCase } = setup(row);
    const result = useCase.execute(TOKEN);
    await expect(result).rejects.toBeInstanceOf(GoneException);
    await expect(result).rejects.toMatchObject({ response: expect.objectContaining({ code: REVIEW_LINK_USED }) });
  });

  it('reports an expired link (410)', async () => {
    const { useCase } = setup({ ...draft, review_token_expires_at: new Date(Date.now() - 1000).toISOString() });
    await expect(useCase.execute(TOKEN)).rejects.toMatchObject({
      status: 410,
      response: expect.objectContaining({ code: REVIEW_LINK_EXPIRED }),
    });
  });

  it('returns 409 APPLICATIONS_CLOSED and no draft data for a valid link while intake is closed', async () => {
    const { useCase, rpc } = setup(draft, false);
    const error = await useCase.execute(TOKEN).catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'APPLICATIONS_CLOSED' });
    expect(JSON.stringify(error.getResponse())).not.toContain('@');
    expect(rpc).toHaveBeenCalledWith('get_application_intake');
  });

  it('still reports a used link as used while intake is closed', async () => {
    const { useCase } = setup({ ...draft, status: 'NEW' }, false);
    await expect(useCase.execute(TOKEN)).rejects.toMatchObject({ response: { code: REVIEW_LINK_USED } });
  });
});

describe('GetApplicationReviewUseCase: one application per applicant', () => {
  it('refuses to open a review for an applicant who has already submitted an application, naming nothing about it', async () => {
    const { useCase, repository } = setup(draft, true, undefined, undefined, async () => true);
    const error = await useCase.execute(TOKEN).catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'PREVIOUS_APPLICATION_EXISTS' });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/@|app-id|Frontend/);
    expect(repository.hasSubmittedApplication).toHaveBeenCalledWith({ email: 'owner@example.com' });
    // The CV (not previously submitted) was checked first.
    expect(repository.hasSubmittedApplicationForCv).toHaveBeenCalledWith('a'.repeat(64), 'app-id');
  });

  it('opens the review for an applicant with no submitted application', async () => {
    const { useCase, repository } = setup(draft);
    await expect(useCase.execute(TOKEN)).resolves.toMatchObject({ applicationId: 'app-id' });
    expect(repository.hasSubmittedApplication).toHaveBeenCalledTimes(1);
  });

  it('fails instead of opening the review when eligibility cannot be checked', async () => {
    const { useCase } = setup(draft, true, undefined, undefined, async () => { throw new Error('Unable to check for an earlier application'); });
    await expect(useCase.execute(TOKEN)).rejects.toThrow(/Unable to check/);
  });
});
