import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { UpdateApplicationStatusUseCase } from './update-application-status.use-case.js';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';

function setup(rpcResult: unknown) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const useCase = new UpdateApplicationStatusUseCase({ client: { rpc } } as never);
  return { useCase, rpc };
}

describe('UpdateApplicationStatusUseCase', () => {
  it('calls the transition-enforcing RPC with the verified actor, reason and note', async () => {
    const { useCase, rpc } = setup({
      data: [{ id: APPLICATION_ID, status: 'REJECTED', rejection_reason: 'Missing skills', changed_at: 'now' }],
      error: null,
    });

    await expect(useCase.execute({
      actorProfileId: 'hr-id',
      applicationId: APPLICATION_ID,
      status: 'REJECTED' as never,
      reason: 'Missing skills',
      note: 'internal',
    })).resolves.toEqual({
      id: APPLICATION_ID,
      status: 'REJECTED',
      rejectionReason: 'Missing skills',
      changedAt: 'now',
    });

    expect(rpc).toHaveBeenCalledWith('update_application_status_v2', {
      p_actor_profile_id: 'hr-id',
      p_application_id: APPLICATION_ID,
      p_status: 'REJECTED',
      p_reason: 'Missing skills',
      p_note: 'internal',
    });
  });

  it('sends null reason and note when omitted', async () => {
    const { useCase, rpc } = setup({
      data: [{ id: APPLICATION_ID, status: 'UNDER_REVIEW', rejection_reason: null, changed_at: 'now' }],
      error: null,
    });

    await useCase.execute({ actorProfileId: 'hr-id', applicationId: APPLICATION_ID, status: 'UNDER_REVIEW' as never });
    expect(rpc).toHaveBeenCalledWith('update_application_status_v2', expect.objectContaining({
      p_reason: null,
      p_note: null,
    }));
  });

  it.each([
    ['application_not_found', 'PZ404', NotFoundException],
    ['rejection_reason_required', 'PZ400', BadRequestException],
    ['reason_only_for_rejection', 'PZ400', BadRequestException],
    ['status_text_too_long', 'PZ400', BadRequestException],
    ['application_decision_final', 'PZ409', ConflictException],
    ['application_status_unchanged', 'PZ409', ConflictException],
    ['invalid_status_transition', 'PZ409', ConflictException],
    ['placement_requires_selected_application', 'PZ409', ConflictException],
    ['training_not_planned', 'PZ409', ConflictException],
    ['training_capacity_not_set', 'PZ409', ConflictException],
    ['training_capacity_full', 'PZ409', ConflictException],
  ])('maps %s to a clear error without exposing database text', async (message, code, Exception) => {
    const { useCase } = setup({ data: null, error: { code, message } });

    const result = useCase.execute({ actorProfileId: 'hr-id', applicationId: APPLICATION_ID, status: 'SELECTED' as never });
    await expect(result).rejects.toBeInstanceOf(Exception);
    await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining('_') });
  });

  it('maps an HR-role refusal from the database to 403', async () => {
    const { useCase } = setup({ data: null, error: { code: 'PZ403', message: 'hr_role_required' } });

    await expect(useCase.execute({ actorProfileId: 'x', applicationId: APPLICATION_ID, status: 'SELECTED' as never }))
      .rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ['null', null],
    ['empty', []],
    ['multiple rows', [{}, {}]],
    ['unexpected status', [{ id: APPLICATION_ID, status: 'DRAFT', rejection_reason: null, changed_at: 'now' }]],
    ['missing id', [{ status: 'SELECTED', rejection_reason: null, changed_at: 'now' }]],
  ])('rejects a %s RPC result as an internal error', async (_label, data) => {
    const { useCase } = setup({ data, error: null });

    await expect(useCase.execute({ actorProfileId: 'hr-id', applicationId: APPLICATION_ID, status: 'SELECTED' as never }))
      .rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
