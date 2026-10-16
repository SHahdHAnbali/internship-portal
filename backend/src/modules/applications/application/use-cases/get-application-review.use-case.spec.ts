import { GoneException, NotFoundException } from '@nestjs/common';

import {
  GetApplicationReviewUseCase,
  REVIEW_LINK_EXPIRED,
  REVIEW_LINK_NOT_FOUND,
  REVIEW_LINK_USED,
} from './get-application-review.use-case.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

function setup(row: Record<string, unknown> | null, intakeOpen = true) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const from = vi.fn(() => query);
  const rpc = vi.fn(async () => ({ data: intakeOpen, error: null }));
  return { useCase: new GetApplicationReviewUseCase({ client: { from, rpc } } as never), from, rpc };
}

const draft = {
  id: 'app-id',
  status: 'DRAFT',
  review_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  review_token_used_at: null,
  review_email: 'owner@example.com',
  extracted_data: { email: 'someone-else@example.com', fullName: 'Owner' },
  requested_training: null,
  internships: { id: 'int', title: 'Engineering' },
};

describe('GetApplicationReviewUseCase', () => {
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
