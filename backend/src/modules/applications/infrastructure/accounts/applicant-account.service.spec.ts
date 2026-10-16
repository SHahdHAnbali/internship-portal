import { ServiceUnavailableException } from '@nestjs/common';

import { ApplicantAccountService } from './applicant-account.service.js';

function setup(
  createUserResult: unknown,
  deleteUserResult: unknown = { error: null },
) {
  const createUser = vi.fn().mockResolvedValue(createUserResult);
  const deleteUser = vi.fn().mockResolvedValue(deleteUserResult);
  const from = vi.fn(() => {
    throw new Error('ApplicantAccountService must not write database rows');
  });
  const supabase = {
    client: {
      auth: { admin: { createUser, deleteUser } },
      from,
    },
  };

  return {
    service: new ApplicantAccountService(supabase as never),
    createUser,
    deleteUser,
    from,
  };
}

describe('ApplicantAccountService', () => {
  it('creates a confirmed Auth user without a client-controlled role and writes no profile or applicant rows', async () => {
    const { service, createUser, from } = setup({
      data: { user: { id: 'new-auth-user-id' } },
      error: null,
    });

    await expect(
      service.createReviewedApplicantAuthUser('owner@example.com', 'Owner Name'),
    ).resolves.toEqual({ status: 'created', authUserId: 'new-auth-user-id' });

    expect(createUser).toHaveBeenCalledWith({
      email: 'owner@example.com',
      email_confirm: true,
      user_metadata: { full_name: 'Owner Name' },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ['email_exists code', { code: 'email_exists', status: 422, message: 'exists' }],
    ['legacy registered message', { status: 422, message: 'A user with this email address has already been registered' }],
  ])('reports an existing account (%s) instead of reusing it', async (_label, error) => {
    const { service, deleteUser } = setup({ data: { user: null }, error });

    await expect(
      service.createReviewedApplicantAuthUser('owner@example.com', 'Owner Name'),
    ).resolves.toEqual({ status: 'exists' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('returns a safe error for other Auth failures without exposing provider details', async () => {
    const { service } = setup({
      data: { user: null },
      error: { status: 500, message: 'internal provider details' },
    });

    const result = service.createReviewedApplicantAuthUser('owner@example.com', 'Owner Name');
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.not.toMatchObject({
      message: expect.stringContaining('provider details'),
    });
  });

  it('reports whether removing an unlinked Auth user succeeded', async () => {
    const ok = setup({ data: null, error: null });
    await expect(ok.service.deleteUnlinkedAuthUser('auth-id')).resolves.toBe(true);
    expect(ok.deleteUser).toHaveBeenCalledWith('auth-id');

    const failed = setup({ data: null, error: null }, { error: { message: 'nope' } });
    await expect(failed.service.deleteUnlinkedAuthUser('auth-id')).resolves.toBe(false);
  });
});
