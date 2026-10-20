import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  ACCOUNT_SIGN_IN_REQUIRED,
  SubmitReviewedApplicationUseCase,
} from './submit-reviewed-application.use-case.js';
import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';

const rawToken = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const reviewTokenHash = createHash('sha256').update(rawToken).digest('hex');

const draft = {
  id: 'draft-id',
  applicant_id: null,
  status: 'DRAFT',
  review_email: 'applicant@example.com',
  extracted_data: { email: 'applicant@example.com' },
  review_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  review_token_used_at: null,
  cv_sha256: 'c'.repeat(64),
};

const reviewedData = {
  email: 'Applicant@Example.com ',
  fullName: 'Reviewed Applicant',
  phone: null,
  location: null,
} as unknown as ExtractedCvData;

const successRow = {
  application_id: 'draft-id',
  applicant_id: 'applicant-id',
  status: 'NEW',
  submitted_at: 'submitted',
};

interface SetupOptions {
  application?: Record<string, unknown> | null;
  rpc?: ReturnType<typeof vi.fn>;
  account?: { status: 'created'; authUserId: string } | { status: 'exists' };
  sessionUser?: Record<string, unknown> | null;
  deleteResult?: boolean;
  intakeOpen?: boolean;
  // Whether this identity already has a submitted application.
  alreadyApplied?: (identity: { authUserId?: string | null; email?: string | null }) => boolean;
  cvAlreadySubmitted?: boolean;
}

function setup(options: SetupOptions = {}) {
  const application = options.application === undefined ? draft : options.application;
  const maybeSingle = vi.fn().mockResolvedValue({ data: application, error: null });
  const query = { select: () => query, eq: () => query, maybeSingle };
  const rpc = options.rpc ?? vi.fn().mockResolvedValue({ data: [successRow], error: null });
  const getUser = vi.fn().mockResolvedValue(
    options.sessionUser
      ? { data: { user: options.sessionUser }, error: null }
      : { data: { user: null }, error: { message: 'invalid' } },
  );
  // The intake read is separate from the review-submission RPC the tests inspect.
  const intake = vi.fn(async () => ({ data: options.intakeOpen ?? true, error: null }));
  const clientRpc = vi.fn((name: string, args?: unknown) =>
    name === 'get_application_intake' ? intake() : (rpc as (n: string, a?: unknown) => unknown)(name, args));
  const supabase = { client: { from: vi.fn(() => query), rpc: clientRpc, auth: { getUser } } };
  const accounts = {
    createReviewedApplicantAuthUser: vi.fn().mockResolvedValue(
      options.account ?? { status: 'created', authUserId: 'new-auth-user-id' },
    ),
    deleteUnlinkedAuthUser: vi.fn().mockResolvedValue(options.deleteResult ?? true),
  };
  const applications = {
    hasSubmittedApplication: vi.fn(async (identity: { authUserId?: string | null; email?: string | null }) =>
      options.alreadyApplied?.(identity) ?? false),
    hasSubmittedApplicationForCv: vi.fn(async () => options.cvAlreadySubmitted ?? false),
  };
  const useCase = new SubmitReviewedApplicationUseCase(supabase as never, accounts as never, applications as never);
  return { useCase, rpc, accounts, getUser, maybeSingle, supabase, intake, applications };
}

const confirmedSessionUser = {
  id: 'existing-auth-user-id',
  email: 'applicant@example.com',
  email_confirmed_at: '2026-10-01T00:00:00Z',
};

describe('SubmitReviewedApplicationUseCase', () => {
  describe('token validation happens before any Auth account work', () => {
    it('rejects a malformed token without querying the database', async () => {
      const { useCase, accounts, rpc, supabase } = setup();

      await expect(useCase.execute('short', reviewedData)).rejects.toBeInstanceOf(NotFoundException);
      await expect(useCase.execute('<script>alert(1)</script>-padding-padding-xx', reviewedData))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(supabase.client.from).not.toHaveBeenCalled();
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      const { useCase, accounts, rpc } = setup({ application: null });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toBeInstanceOf(NotFoundException);
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it.each([
      ['expired', { ...draft, review_token_expires_at: new Date(Date.now() - 1).toISOString() }],
      ['missing expiry', { ...draft, review_token_expires_at: null }],
      ['already consumed', { ...draft, review_token_used_at: new Date().toISOString() }],
      ['no longer a draft', { ...draft, status: 'NEW' }],
    ])('rejects a %s token', async (_label, application) => {
      const { useCase, accounts, rpc } = setup({ application });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toBeInstanceOf(BadRequestException);
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('review email is immutable', () => {
    it('rejects a changed email before creating an account', async () => {
      const { useCase, accounts, rpc } = setup();

      await expect(
        useCase.execute(rawToken, { ...reviewedData, email: 'someone-else@example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('maps a database-level email mismatch to a clear error', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PZ400', message: 'review_email_mismatch' },
      });
      const { useCase } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('cannot be changed'),
      });
    });

    it('uses the legacy extracted email when a draft predates review_email', async () => {
      const { useCase, accounts } = setup({
        application: { ...draft, review_email: null, extracted_data: { email: 'APPLICANT@example.com' } },
      });

      await useCase.execute(rawToken, reviewedData);
      expect(accounts.createReviewedApplicantAuthUser)
        .toHaveBeenCalledWith('applicant@example.com', 'Reviewed Applicant');
    });

    it('refuses a draft whose review email is unknown', async () => {
      const { useCase, accounts } = setup({
        application: { ...draft, review_email: null, extracted_data: null },
      });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toBeInstanceOf(ConflictException);
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
    });
  });

  describe('account creation', () => {
    it('creates an account only after validation and submits with the normalized review email', async () => {
      const { useCase, accounts, rpc } = setup();

      await expect(useCase.execute(rawToken, reviewedData)).resolves.toEqual({
        applicationId: 'draft-id',
        status: 'NEW',
        submittedAt: 'submitted',
        message: 'Application submitted successfully.',
      });
      expect(accounts.createReviewedApplicantAuthUser)
        .toHaveBeenCalledWith('applicant@example.com', 'Reviewed Applicant');
      expect(rpc).toHaveBeenCalledWith('submit_application_review_v2', {
        p_review_token_hash: reviewTokenHash,
        p_extracted_data: { ...reviewedData, email: 'applicant@example.com' },
        p_auth_user_id: 'new-auth-user-id',
        p_account_created: true,
      });
    });

    it('does not reuse or link an existing account; the caller must sign in', async () => {
      const { useCase, accounts, rpc } = setup({ account: { status: 'exists' } });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: ACCOUNT_SIGN_IN_REQUIRED }),
      });
      expect(rpc).not.toHaveBeenCalled();
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });
  });

  describe('signed-in submission', () => {
    it('submits with the verified session user and creates no account', async () => {
      const { useCase, accounts, rpc, getUser } = setup({ sessionUser: confirmedSessionUser });

      await useCase.execute(rawToken, reviewedData, 'session-token');
      expect(getUser).toHaveBeenCalledWith('session-token');
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith('submit_application_review_v2', expect.objectContaining({
        p_auth_user_id: 'existing-auth-user-id',
        p_account_created: false,
      }));
    });

    it('rejects an invalid session', async () => {
      const { useCase, rpc } = setup({ sessionUser: null });

      await expect(useCase.execute(rawToken, reviewedData, 'bad-token'))
        .rejects.toBeInstanceOf(UnauthorizedException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('rejects a session for a different email address', async () => {
      const { useCase, rpc } = setup({
        sessionUser: { ...confirmedSessionUser, email: 'other@example.com' },
      });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('does not treat an unconfirmed account as verified', async () => {
      const { useCase, rpc } = setup({
        sessionUser: { ...confirmedSessionUser, email_confirmed_at: null },
      });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('refuses staff accounts without deleting anything', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PZ403', message: 'staff_account_not_eligible' },
      });
      const { useCase, accounts } = setup({ rpc, sessionUser: confirmedSessionUser });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });
  });

  describe('legacy drafts', () => {
    const legacyDraft = { ...draft, review_email: null, applicant_id: 'legacy-applicant-id' };

    it('requires the existing owner to sign in instead of creating a new account', async () => {
      const { useCase, accounts, rpc } = setup({ application: legacyDraft });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: ACCOUNT_SIGN_IN_REQUIRED }),
      });
      expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('remains usable by the signed-in owner of the associated applicant', async () => {
      const { useCase, rpc } = setup({ application: legacyDraft, sessionUser: confirmedSessionUser });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token')).resolves.toMatchObject({
        status: 'NEW',
      });
      expect(rpc).toHaveBeenCalledWith('submit_application_review_v2', expect.objectContaining({
        p_auth_user_id: 'existing-auth-user-id',
        p_account_created: false,
      }));
    });

    it.each([
      'legacy_review_owner_mismatch',
      'applicant_identity_conflict',
      'review_account_email_mismatch',
      'review_account_state_conflict',
    ])('refuses ambiguous associations (%s) without leaking database details', async (message) => {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message } });
      const { useCase } = setup({ application: legacyDraft, rpc, sessionUser: confirmedSessionUser });

      const result = useCase.execute(rawToken, reviewedData, 'session-token');
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      await expect(result).rejects.toMatchObject({
        message: expect.stringContaining('could not safely link'),
      });
    });
  });

  describe('duplicate submissions', () => {
    it('lets the database claim arbitrate concurrent requests with the same token', async () => {
      let attempts = 0;
      const rpc = vi.fn(async () => {
        attempts += 1;
        return attempts === 1
          ? { data: [successRow], error: null }
          : { data: null, error: { code: 'PZ409', message: 'review_token_already_used' } };
      });
      const { useCase, accounts } = setup({ rpc, sessionUser: confirmedSessionUser });

      const results = await Promise.allSettled([
        useCase.execute(rawToken, reviewedData, 'session-token'),
        useCase.execute(rawToken, reviewedData, 'session-token'),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: expect.any(ConflictException),
      });
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });

    it('reports an existing application for the same internship', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PZ409', message: 'duplicate_application' },
      });
      const { useCase } = setup({ rpc, sessionUser: confirmedSessionUser });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token')).rejects.toMatchObject({
        status: 409,
        message: 'You have already applied for this training.',
      });
    });
  });

  describe('failures between Auth creation and database submission', () => {
    it.each([
      'applications_cv_sha256_active_target_key',
      'applications_applicant_other_training_key',
      'applications_applicant_id_internship_id_key',
    ])('maps a concurrent duplicate caught by %s to the duplicate message and cleans up the new account', async (index) => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: `duplicate key value violates unique constraint "${index}"` },
      });
      const { useCase, accounts } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({
        status: 409,
        message: 'You have already applied for this training.',
      });
      expect(accounts.deleteUnlinkedAuthUser).toHaveBeenCalledWith('new-auth-user-id');
    });

    it('removes the newly created account after a definite database rollback', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PZ409', message: 'review_token_already_used' },
      });
      const { useCase, accounts } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toBeInstanceOf(ConflictException);
      expect(accounts.deleteUnlinkedAuthUser).toHaveBeenCalledWith('new-auth-user-id');
    });

    it('does not delete the account when the database outcome is unknown', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '', message: 'TypeError: fetch failed' },
      });
      const { useCase, accounts } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });

    it('does not delete the account when the request itself throws', async () => {
      const rpc = vi.fn().mockRejectedValue(new Error('socket hang up'));
      const { useCase, accounts } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });

    it('does not delete the account when the result is malformed', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const { useCase, accounts } = setup({ rpc });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({
        status: 500,
        message: 'Application review submission returned an invalid result',
      });
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });

    it('never deletes a pre-existing account after a database failure', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });
      const { useCase, accounts } = setup({ rpc, sessionUser: confirmedSessionUser });

      await expect(useCase.execute(rawToken, reviewedData, 'session-token'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
    });

    it('still returns the mapped error when cleanup fails', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PZ409', message: 'applicant_identity_conflict' },
      });
      const { useCase, accounts } = setup({ rpc, deleteResult: false });

      await expect(useCase.execute(rawToken, reviewedData)).rejects.toBeInstanceOf(ConflictException);
      expect(accounts.deleteUnlinkedAuthUser).toHaveBeenCalledWith('new-auth-user-id');
    });
  });
});

describe('SubmitReviewedApplicationUseCase while portal intake is closed', () => {
  it('refuses with APPLICATIONS_CLOSED before creating or verifying any account', async () => {
    const { useCase, accounts, rpc, getUser } = setup({ intakeOpen: false, sessionUser: confirmedSessionUser });
    const error = await useCase.execute(rawToken, reviewedData, 'session-token').catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'APPLICATIONS_CLOSED' });
    expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('removes the account it created when the database refuses because intake closed meanwhile', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PZ409', message: 'applications_closed' } });
    const { useCase, accounts } = setup({ rpc });
    await expect(useCase.execute(rawToken, reviewedData)).rejects.toMatchObject({ response: { code: 'APPLICATIONS_CLOSED' } });
    expect(accounts.createReviewedApplicantAuthUser).toHaveBeenCalledTimes(1);
    expect(accounts.deleteUnlinkedAuthUser).toHaveBeenCalledWith('new-auth-user-id');
  });
});

describe('SubmitReviewedApplicationUseCase: one application per applicant, ever', () => {
  it('refuses an applicant whose email already has a submitted application, before any account is created', async () => {
    const { useCase, accounts, rpc, getUser, applications } = setup({ alreadyApplied: ({ email }) => email === 'applicant@example.com' });
    const error = await useCase.execute(rawToken, reviewedData).catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'PREVIOUS_APPLICATION_EXISTS' });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/@|draft-id|applicant-id/);
    expect(applications.hasSubmittedApplication).toHaveBeenCalledWith({ email: 'applicant@example.com' });
    expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a signed-in applicant or intern whose account already has a submitted application', async () => {
    const { useCase, rpc, applications } = setup({
      sessionUser: confirmedSessionUser,
      alreadyApplied: ({ authUserId }) => authUserId === 'existing-auth-user-id',
    });
    await expect(useCase.execute(rawToken, reviewedData, 'session-token')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREVIOUS_APPLICATION_EXISTS' }),
    });
    expect(applications.hasSubmittedApplication).toHaveBeenLastCalledWith({ authUserId: 'existing-auth-user-id', email: 'applicant@example.com' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets a genuinely new applicant submit normally', async () => {
    const { useCase, accounts, rpc } = setup();
    await expect(useCase.execute(rawToken, reviewedData)).resolves.toMatchObject({ status: 'NEW' });
    expect(accounts.createReviewedApplicantAuthUser).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails, without creating an account, when eligibility cannot be checked', async () => {
    const { useCase, accounts, rpc } = setup({ alreadyApplied: () => { throw new Error('Unable to check for an earlier application'); } });
    await expect(useCase.execute(rawToken, reviewedData)).rejects.toThrow(/Unable to check/);
    expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('SubmitReviewedApplicationUseCase: the database refuses a second application (concurrent submissions)', () => {
  const refused = { data: null, error: { code: 'PZ409', message: 'previous_application_exists' } };

  it('maps previous_application_exists to 409 PREVIOUS_APPLICATION_EXISTS and removes the account it just created', async () => {
    // Both pre-checks passed (the other draft was not committed yet); the
    // database function, holding the per-applicant lock, refuses this one.
    const { useCase, accounts } = setup({ rpc: vi.fn().mockResolvedValue(refused) });
    const error = await useCase.execute(rawToken, reviewedData).catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'PREVIOUS_APPLICATION_EXISTS' });
    expect(accounts.deleteUnlinkedAuthUser).toHaveBeenCalledWith('new-auth-user-id');
  });

  it('maps it the same way for a signed-in applicant and never deletes their existing account', async () => {
    const { useCase, accounts } = setup({ sessionUser: confirmedSessionUser, rpc: vi.fn().mockResolvedValue(refused) });
    await expect(useCase.execute(rawToken, reviewedData, 'session-token')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREVIOUS_APPLICATION_EXISTS' }),
    });
    expect(accounts.deleteUnlinkedAuthUser).not.toHaveBeenCalled();
  });

  it('refuses one of two concurrent submissions of different drafts by the same applicant', async () => {
    // The database serializes them: the first commits, the second sees it.
    let committed = false;
    const rpc = vi.fn(async () => {
      if (committed) return refused;
      committed = true;
      return { data: [successRow], error: null };
    });
    const { useCase } = setup({ sessionUser: confirmedSessionUser, rpc });
    const results = await Promise.allSettled([
      useCase.execute(rawToken, reviewedData, 'session-token'),
      useCase.execute(rawToken, reviewedData, 'session-token'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ response: expect.objectContaining({ code: 'PREVIOUS_APPLICATION_EXISTS' }) });
  });
});

describe('SubmitReviewedApplicationUseCase: a CV already submitted with another application', () => {
  it('is refused with CV_ALREADY_SUBMITTED before the one-application rule and before any account is created', async () => {
    const { useCase, accounts, rpc, getUser, applications } = setup({ cvAlreadySubmitted: true, alreadyApplied: () => true, sessionUser: confirmedSessionUser });
    const error = await useCase.execute(rawToken, reviewedData, 'session-token').catch((e: unknown) => e) as { getStatus(): number; getResponse(): unknown };
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'CV_ALREADY_SUBMITTED' });
    expect(applications.hasSubmittedApplicationForCv).toHaveBeenCalledWith('c'.repeat(64), 'draft-id');
    expect(applications.hasSubmittedApplication).not.toHaveBeenCalled();
    expect(accounts.createReviewedApplicantAuthUser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('is not checked for a legacy draft without a stored fingerprint', async () => {
    const { useCase, applications } = setup({ application: { ...draft, cv_sha256: null } });
    await expect(useCase.execute(rawToken, reviewedData)).resolves.toMatchObject({ status: 'NEW' });
    expect(applications.hasSubmittedApplicationForCv).not.toHaveBeenCalled();
  });
});
