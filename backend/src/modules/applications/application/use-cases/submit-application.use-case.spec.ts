import { ConflictException, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { SubmitApplicationUseCase } from './submit-application.use-case.js';
import { ApplicationEmailService } from '../../infrastructure/email/application-email.service.js';
import type { ExtractedCvData } from '../../domain/types/extracted-cv-data.js';

const file = {
  buffer: Buffer.from('cv'),
  mimetype: 'application/pdf',
  size: 2,
  originalname: 'cv.pdf',
} as Express.Multer.File;

const CV_SHA256 = createHash('sha256').update(Buffer.from('cv')).digest('hex');

function setup(options: {
  extractedEmail?: string | null;
  sendReviewEmail?: () => Promise<void>;
  createDraft?: () => Promise<unknown>;
  emailService?: unknown;
  duplicateCv?: boolean;
  intakeOpen?: boolean;
  // Whether this identity already has a submitted application.
  alreadyApplied?: (identity: { authUserId?: string | null; email?: string | null }) => boolean;
  sessionUser?: { id: string; email: string } | null;
} = {}) {
  const extractedData = {
    email: options.extractedEmail === undefined
      ? '  Applicant@Example.COM '
      : options.extractedEmail,
    fullName: 'Applicant Example',
    skills: ['TypeScript'],
  } as unknown as ExtractedCvData;
  const touchedTables: string[] = [];
  const createUser = vi.fn();
  const getUser = vi.fn(async () => (options.sessionUser
    ? { data: { user: options.sessionUser }, error: null }
    : { data: { user: null }, error: { message: 'invalid' } }));
  const rpc = vi.fn(async (name: string) => (name === 'get_application_intake'
    ? { data: options.intakeOpen ?? true, error: null }
    : { data: null, error: { message: `unexpected rpc ${name}` } }));
  const supabase = {
    client: {
      rpc,
      auth: { admin: { createUser }, getUser },
      from: (table: string) => {
        touchedTables.push(table);
        if (table !== 'internships') {
          throw new Error(`Unexpected table access: ${table}`);
        }
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => ({
            data: { id: 'internship-id', title: 'Engineering', is_active: true },
            error: null,
          }),
        };
        return query;
      },
    },
  };
  const draft = { id: 'draft-id', status: 'DRAFT', reviewToken: 'single-use-review-token' };
  const applicationRepository = {
    createDraft: vi.fn(options.createDraft ?? (async () => draft)),
    deleteUnsubmittedDraft: vi.fn(async () => undefined),
    hasSubmittedApplicationForCv: vi.fn(async () => options.duplicateCv ?? false),
    hasSubmittedApplication: vi.fn(async (identity: { authUserId?: string | null; email?: string | null }) =>
      options.alreadyApplied?.(identity) ?? false),
  };
  const cvStorageService = {
    assertValidFile: vi.fn(),
    upload: vi.fn(async () => 'private/cv-path.pdf'),
    remove: vi.fn(async () => true),
  };
  const cvTextExtractorService = { extractText: vi.fn(async () => 'CV text') };
  const aiCvParserService = { parse: vi.fn(async () => extractedData) };
  const applicationEmailService = {
    sendReviewEmail: vi.fn(options.sendReviewEmail ?? (async () => undefined)),
  };
  const useCase = new SubmitApplicationUseCase(
    applicationRepository as never,
    cvStorageService as never,
    cvTextExtractorService as never,
    supabase as never,
    aiCvParserService as never,
    (options.emailService ?? applicationEmailService) as never,
  );

  return {
    useCase,
    extractedData,
    draft,
    touchedTables,
    createUser,
    applicationRepository,
    cvStorageService,
    applicationEmailService,
    aiCvParserService,
    cvTextExtractorService,
    rpc,
    getUser,
  };
}

describe('SubmitApplicationUseCase while portal intake is closed', () => {
  it('refuses with APPLICATIONS_CLOSED before validating, parsing, storing or emailing anything', async () => {
    const ctx = setup({ intakeOpen: false });
    const error = await ctx.useCase.execute(null, 'Other training', file).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ statusCode: 409, code: 'APPLICATIONS_CLOSED' });
    expect(ctx.cvStorageService.assertValidFile).not.toHaveBeenCalled();
    expect(ctx.cvTextExtractorService.extractText).not.toHaveBeenCalled();
    expect(ctx.aiCvParserService.parse).not.toHaveBeenCalled();
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
    expect(ctx.touchedTables).toEqual([]);
  });

  it('removes the uploaded file when the database refuses the draft because intake closed meanwhile', async () => {
    const closed = new ConflictException({ statusCode: 409, code: 'APPLICATIONS_CLOSED', message: 'closed' });
    const ctx = setup({ createDraft: async () => { throw closed; } });
    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toBe(closed);
    expect(ctx.cvStorageService.remove).toHaveBeenCalledWith('private/cv-path.pdf');
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the intake setting cannot be read', async () => {
    const ctx = setup();
    ctx.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
  });
});

describe('SubmitApplicationUseCase', () => {
  it('creates only a draft bound to the normalized review email; no Auth user, applicant, or profile', async () => {
    const ctx = setup();

    await expect(ctx.useCase.execute('internship-id', null, file)).resolves.toEqual({
      applicationId: 'draft-id',
      status: 'DRAFT',
      message: 'Application received successfully.',
    });

    expect(ctx.createUser).not.toHaveBeenCalled();
    expect(ctx.touchedTables).toEqual(['internships']);
    expect(ctx.applicationRepository.createDraft).toHaveBeenCalledWith({
      internshipId: 'internship-id',
      requestedTraining: null,
      cvPath: 'private/cv-path.pdf',
      cvSha256: CV_SHA256,
      extractedData: { ...ctx.extractedData, email: 'applicant@example.com' },
      reviewEmail: 'applicant@example.com',
    });
    expect(ctx.applicationEmailService.sendReviewEmail).toHaveBeenCalledWith(
      'applicant@example.com',
      'single-use-review-token',
      'Engineering',
    );
  });

  it('rejects a CV without a usable email before storing anything', async () => {
    const ctx = setup({ extractedEmail: 'not-an-email' });

    await expect(ctx.useCase.execute('internship-id', null, file))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });

  it('removes the draft and file when the review email cannot be sent', async () => {
    const ctx = setup({
      sendReviewEmail: async () => {
        throw new Error('provider failure');
      },
    });

    await expect(ctx.useCase.execute('internship-id', null, file))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.applicationRepository.deleteUnsubmittedDraft).toHaveBeenCalledWith('draft-id');
    expect(ctx.cvStorageService.remove).toHaveBeenCalledWith('private/cv-path.pdf');
  });

  it('removes the uploaded file when the draft cannot be created', async () => {
    const ctx = setup({
      createDraft: async () => {
        throw new Error('insert failed');
      },
    });

    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toThrow('insert failed');
    expect(ctx.cvStorageService.remove).toHaveBeenCalledWith('private/cv-path.pdf');
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });
});

describe('SubmitApplicationUseCase with the development recipient override', () => {
  function realEmailService(send: ReturnType<typeof vi.fn>) {
    const values: Record<string, string> = {
      'email.resendApiKey': 'test-key',
      'email.frontendUrl': 'https://portal.example.com',
      'email.applicationReviewEmailOverride': 'dev-inbox@example.com',
      'email.nodeEnv': 'test',
    };
    const service = new ApplicationEmailService({ get: (key: string) => values[key] } as never);
    Object.defineProperty(service, 'resend', { value: { emails: { send } } });
    return service;
  }

  it('keeps each applicant email on its draft while delivering each own review link to the override inbox', async () => {
    const send = vi.fn(async (_payload: { to: string; html: string }) => ({ data: { id: 'email-id' }, error: null }));
    const emailService = realEmailService(send);

    const first = setup({
      extractedEmail: 'First.Applicant@Example.com',
      createDraft: async () => ({ id: 'draft-1', status: 'DRAFT', reviewToken: 'token-for-draft-1' }),
      emailService,
    });
    const second = setup({
      extractedEmail: 'second@example.org',
      createDraft: async () => ({ id: 'draft-2', status: 'DRAFT', reviewToken: 'token-for-draft-2' }),
      emailService,
    });

    await first.useCase.execute('internship-id', null, file);
    await second.useCase.execute('internship-id', null, file);

    // The applicant's own address is what gets stored; the inbox never is.
    expect(first.applicationRepository.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      reviewEmail: 'first.applicant@example.com',
      extractedData: expect.objectContaining({ email: 'first.applicant@example.com' }),
    }));
    expect(second.applicationRepository.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      reviewEmail: 'second@example.org',
      extractedData: expect.objectContaining({ email: 'second@example.org' }),
    }));
    expect(JSON.stringify([
      first.applicationRepository.createDraft.mock.calls,
      second.applicationRepository.createDraft.mock.calls,
    ])).not.toContain('dev-inbox');
    expect(first.createUser).not.toHaveBeenCalled();
    expect(second.createUser).not.toHaveBeenCalled();

    const [firstEmail, secondEmail] = send.mock.calls.map(([payload]) => payload);
    expect(firstEmail.to).toBe('dev-inbox@example.com');
    expect(secondEmail.to).toBe('dev-inbox@example.com');
    expect(firstEmail.html).toContain('/application-review/token-for-draft-1');
    expect(firstEmail.html).not.toContain('token-for-draft-2');
    expect(secondEmail.html).toContain('/application-review/token-for-draft-2');
    expect(secondEmail.html).not.toContain('token-for-draft-1');
  });

  it('reports a rejected delivery as a failure and removes only the draft and file it created', async () => {
    const send = vi.fn(async () => ({ data: null, error: { name: 'validation_error', message: 'testing mode' } }));
    const ctx = setup({ emailService: realEmailService(send) });

    await expect(ctx.useCase.execute('internship-id', null, file))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(ctx.applicationRepository.deleteUnsubmittedDraft).toHaveBeenCalledTimes(1);
    expect(ctx.applicationRepository.deleteUnsubmittedDraft).toHaveBeenCalledWith('draft-id');
    expect(ctx.cvStorageService.remove).toHaveBeenCalledTimes(1);
    expect(ctx.cvStorageService.remove).toHaveBeenCalledWith('private/cv-path.pdf');
  });
});

describe('SubmitApplicationUseCase duplicate CV protection', () => {
  it.each([
    ['the same training', 'internship-id', null],
    ['a different listed training', 'other-internship-id', null],
    ['an "Other" training area', null, 'Data Science'],
  ])('refuses a CV already submitted with an application, for %s, with its own message before any AI call or storage', async (_label, internshipId, requested) => {
    const ctx = setup({ duplicateCv: true });
    const error = await ctx.useCase.execute(internshipId, requested, file).catch((e: unknown) => e) as ConflictException;

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ statusCode: 409, code: 'CV_ALREADY_SUBMITTED' });
    expect((error.getResponse() as { message: string }).message).toMatch(/already been submitted with an application, so it cannot be used for another application/);
    // Any training: the target plays no part in the lookup.
    expect(ctx.applicationRepository.hasSubmittedApplicationForCv).toHaveBeenCalledWith(CV_SHA256, null);
    expect(ctx.aiCvParserService.parse).not.toHaveBeenCalled();
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });

  // Regression: a previously submitted CV re-uploaded by an applicant who has
  // also already applied must report the CV, not "already applied".
  it('reports a re-used CV as such even when its applicant has already applied (guest or signed in)', async () => {
    const guest = setup({ duplicateCv: true, alreadyApplied: () => true });
    await expect(guest.useCase.execute('other-internship-id', null, file)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CV_ALREADY_SUBMITTED' }),
    });
    expect(guest.applicationRepository.hasSubmittedApplication).not.toHaveBeenCalled();

    const signedIn = setup({
      duplicateCv: true,
      alreadyApplied: () => true,
      sessionUser: { id: 'auth-id', email: 'applicant@example.com' },
    });
    await expect(signedIn.useCase.execute('other-internship-id', null, file, 'session-token')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CV_ALREADY_SUBMITTED' }),
    });
    expect(signedIn.getUser).not.toHaveBeenCalled();
  });

  it('a new CV from an applicant who has already applied falls to the one-application rule', async () => {
    const ctx = setup({ duplicateCv: false, alreadyApplied: ({ email }) => email === 'applicant@example.com' });
    await expect(ctx.useCase.execute('other-internship-id', null, file)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREVIOUS_APPLICATION_EXISTS' }),
    });
  });

  it('fails, storing nothing, when the CV check cannot run', async () => {
    const ctx = setup();
    ctx.applicationRepository.hasSubmittedApplicationForCv.mockRejectedValueOnce(new Error('Unable to check whether this CV was already submitted'));
    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toThrow(/Unable to check/);
    expect(ctx.aiCvParserService.parse).not.toHaveBeenCalled();
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
  });
});

// The 7 existing accounts: 6 applicants whose applications are still pending
// (NEW and later statuses) and 1 who was selected and became an INTERN. Every
// one of them is refused, whatever training or CV they use; the repository
// counts every status except DRAFT (see its spec).
describe('SubmitApplicationUseCase: one application per applicant, ever', () => {
  const differentCv = { ...file, buffer: Buffer.from('a completely different CV') } as Express.Multer.File;

  it.each([
    ['the same training', 'internship-id', null, file],
    ['a different listed training with a different CV', 'other-internship-id', null, differentCv],
    ['an "Other" training area', null, 'Robotics', differentCv],
  ])('refuses an applicant (by the email in the CV) who already applied, for %s, before storing or emailing anything', async (_label, internshipId, requested, cv) => {
    const ctx = setup({ alreadyApplied: ({ email }) => email === 'applicant@example.com' });
    const error = await ctx.useCase.execute(internshipId, requested, cv).catch((e: unknown) => e) as ConflictException;

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ statusCode: 409, code: 'PREVIOUS_APPLICATION_EXISTS' });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/@|Engineering|Robotics|internship-id/);
    expect(ctx.applicationRepository.hasSubmittedApplication).toHaveBeenCalledWith({ email: 'applicant@example.com' });
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });

  it('refuses a signed-in applicant or intern with a submitted application before the CV is even parsed', async () => {
    const ctx = setup({
      sessionUser: { id: 'intern-auth-id', email: 'Intern@Example.com' },
      alreadyApplied: ({ authUserId }) => authUserId === 'intern-auth-id',
    });
    await expect(ctx.useCase.execute('other-internship-id', null, differentCv, 'session-token')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREVIOUS_APPLICATION_EXISTS' }),
    });
    expect(ctx.getUser).toHaveBeenCalledWith('session-token');
    expect(ctx.applicationRepository.hasSubmittedApplication).toHaveBeenCalledWith({ authUserId: 'intern-auth-id', email: 'intern@example.com' });
    expect(ctx.cvTextExtractorService.extractText).not.toHaveBeenCalled();
    expect(ctx.aiCvParserService.parse).not.toHaveBeenCalled();
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
  });

  it('refuses an invalid session instead of treating the caller as anonymous', async () => {
    const ctx = setup();
    await expect(ctx.useCase.execute('internship-id', null, file, 'bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
  });

  it('lets a genuinely new applicant (signed in or not) apply normally', async () => {
    const guest = setup();
    await expect(guest.useCase.execute('internship-id', null, file)).resolves.toMatchObject({ status: 'DRAFT' });
    expect(guest.applicationRepository.createDraft).toHaveBeenCalledTimes(1);

    const signedIn = setup({ sessionUser: { id: 'new-auth-id', email: 'new@example.com' } });
    await expect(signedIn.useCase.execute('internship-id', null, file, 'session-token')).resolves.toMatchObject({ status: 'DRAFT' });
    expect(signedIn.applicationEmailService.sendReviewEmail).toHaveBeenCalledTimes(1);
  });

  it('fails, storing nothing, when eligibility cannot be checked', async () => {
    const ctx = setup({ alreadyApplied: () => { throw new Error('Unable to check for an earlier application'); } });
    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toThrow(/Unable to check/);
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
  });
});
