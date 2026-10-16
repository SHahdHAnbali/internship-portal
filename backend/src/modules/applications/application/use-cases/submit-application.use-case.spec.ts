import { ConflictException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
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
  const rpc = vi.fn(async (name: string) => (name === 'get_application_intake'
    ? { data: options.intakeOpen ?? true, error: null }
    : { data: null, error: { message: `unexpected rpc ${name}` } }));
  const supabase = {
    client: {
      rpc,
      auth: { admin: { createUser } },
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
    hasActiveApplicationForCv: vi.fn(async () => options.duplicateCv ?? false),
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
  it('refuses a CV already active for the same training before any AI call or storage', async () => {
    const ctx = setup({ duplicateCv: true });

    await expect(ctx.useCase.execute('internship-id', null, file)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.applicationRepository.hasActiveApplicationForCv).toHaveBeenCalledWith(CV_SHA256, 'internship-id', null);
    expect(ctx.cvStorageService.upload).not.toHaveBeenCalled();
    expect(ctx.applicationRepository.createDraft).not.toHaveBeenCalled();
    expect(ctx.applicationEmailService.sendReviewEmail).not.toHaveBeenCalled();
  });

  it('checks "Other" requests by their trimmed training label', async () => {
    const ctx = setup();
    await ctx.useCase.execute(null, '  Data Science ', file);
    expect(ctx.applicationRepository.hasActiveApplicationForCv).toHaveBeenCalledWith(CV_SHA256, null, 'Data Science');
  });
});
