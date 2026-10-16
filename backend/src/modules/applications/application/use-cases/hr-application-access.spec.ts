import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { GetApplicationDetailsUseCase } from './get-application-details.use-case.js';
import { GetApplicationCvUrlUseCase, CV_URL_LIFETIME_SECONDS } from './get-application-cv-url.use-case.js';
import { GetApplicationMatchUseCase } from './get-application-match.use-case.js';
import { MatchApplicationUseCase } from './match-application.use-case.js';
import { ParseCvUseCase } from './parse-cv.use-case.js';

const ID = '11111111-1111-4111-8111-111111111111';

// Minimal Supabase stub: one row per table, recorded calls.
function supabaseStub(tables: Record<string, { data: unknown; error?: unknown }>) {
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/cv?token=x' }, error: null }));
  const download = vi.fn();
  const queried: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      queried.push(table);
      const result = tables[table] ?? { data: null };
      // A real promise with the builder methods: some queries are awaited
      // directly (e.g. a placement status list).
      const query: Record<string, unknown> = Object.assign(
        Promise.resolve({ data: result.data, error: result.error ?? null }),
        {} as Record<string, unknown>,
      );
      for (const method of ['select', 'eq', 'upsert']) {
        query[method] = () => query;
      }
      // Queries that end in .order() are awaited directly.
      query.order = async () => ({ data: result.data, error: result.error ?? null });
      query.maybeSingle = async () => ({ data: result.data, error: result.error ?? null });
      query.single = async () => ({ data: result.data, error: result.error ?? null });
      return query;
    }),
    storage: { from: () => ({ createSignedUrl, download }) },
    // resolve_application_training: an unlinked request (no opportunity).
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  return { supabase: { client } as never, createSignedUrl, download, queried };
}

const draft = { id: ID, status: 'DRAFT', cv_path: 'cv.pdf', internship_id: 'i', extracted_data: {} };

describe('HR access to a single application never reaches drafts', () => {
  const cases: Array<[string, (supabase: never) => Promise<unknown>]> = [
    ['details', (supabase) => new GetApplicationDetailsUseCase(supabase).execute(ID)],
    ['cv-url', (supabase) => new GetApplicationCvUrlUseCase(supabase).execute(ID)],
    ['get match', (supabase) => new GetApplicationMatchUseCase(supabase).execute(ID)],
    ['run match', (supabase) => new MatchApplicationUseCase(supabase, { match: vi.fn() } as never).execute(ID)],
    ['parse', (supabase) => new ParseCvUseCase(supabase, { extractText: vi.fn() } as never).execute(ID)],
  ];

  it.each(cases)('%s: a draft is reported exactly like a missing application', async (_label, run) => {
    const { supabase, createSignedUrl, download } = supabaseStub({ applications: { data: draft } });
    await expect(run(supabase)).rejects.toBeInstanceOf(NotFoundException);
    await expect(run(supabase)).rejects.toMatchObject({ message: 'Application not found' });
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(cases)('%s: a missing application is not found', async (_label, run) => {
    const { supabase } = supabaseStub({ applications: { data: null } });
    await expect(run(supabase)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(cases)('%s: database errors are not leaked', async (_label, run) => {
    const { supabase } = supabaseStub({ applications: { data: null, error: { message: 'relation "x" secret detail' } } });
    const result = run(supabase);
    await expect(result).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(result).rejects.not.toMatchObject({ message: expect.stringContaining('secret') });
  });
});

describe('GetApplicationDetailsUseCase', () => {
  const row = {
    id: ID,
    status: 'SHORTLISTED',
    applied_at: '2026-10-01T09:00:00Z',
    submitted_at: '2026-10-01T10:00:00Z',
    created_at: '2026-10-01T09:00:00Z',
    cv_path: 'private/cv.pdf',
    extracted_data: { fullName: 'Reviewed Name', languages: ['Arabic'], certifications: ['AWS'] },
    original_extracted_data: { fullName: 'AI Name' },
    requested_training: null,
    rejection_reason: null,
    applicants: { id: 'app', full_name: 'Reviewed Name', email: 'r@x.com' },
    internships: { id: 'int', title: 'Engineering' },
  };
  const events = [{
    id: 'e1', from_status: 'DRAFT', to_status: 'NEW', reason: null, note: null,
    created_at: '2026-10-01T10:00:00Z', actor: { id: 'app-user', full_name: 'Reviewed Name', role: 'APPLICANT' },
  }];

  it('returns reviewed and original data separately, history, allowed transitions and no CV path', async () => {
    const { supabase } = supabaseStub({ applications: { data: row }, application_status_events: { data: events } });
    const result = await new GetApplicationDetailsUseCase(supabase).execute(ID);

    expect(result.reviewedData).toEqual(row.extracted_data);
    expect(result.originalExtraction).toEqual({ fullName: 'AI Name' });
    expect(result.allowedTransitions).toEqual(['INTERVIEW', 'SELECTED', 'REJECTED']);
    expect(result.hasCv).toBe(true);
    expect(result.statusHistory).toEqual([{
      id: 'e1', fromStatus: 'DRAFT', toStatus: 'NEW', reason: null, note: null,
      createdAt: '2026-10-01T10:00:00Z', actor: { id: 'app-user', fullName: 'Reviewed Name', role: 'APPLICANT' },
    }]);
    expect(JSON.stringify(result)).not.toContain('private/cv.pdf');
    expect(result).not.toHaveProperty('cvUrl');
  });

  it('reports a legacy application without a retained original extraction', async () => {
    const { supabase } = supabaseStub({
      applications: { data: { ...row, original_extracted_data: null } },
      application_status_events: { data: [] },
    });
    const result = await new GetApplicationDetailsUseCase(supabase).execute(ID);
    expect(result.originalExtraction).toBeNull();
  });
});

describe('GetApplicationCvUrlUseCase', () => {
  it('issues a short-lived signed URL for the stored CV on demand', async () => {
    const { supabase, createSignedUrl } = supabaseStub({ applications: { data: { status: 'NEW', cv_path: 'private/cv.pdf' } } });
    const result = await new GetApplicationCvUrlUseCase(supabase).execute(ID);

    expect(createSignedUrl).toHaveBeenCalledWith('private/cv.pdf', CV_URL_LIFETIME_SECONDS);
    expect(CV_URL_LIFETIME_SECONDS).toBeLessThanOrEqual(600);
    expect(result.url).toBe('https://signed.example/cv?token=x');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('reports a missing CV', async () => {
    const { supabase } = supabaseStub({ applications: { data: { status: 'NEW', cv_path: null } } });
    await expect(new GetApplicationCvUrlUseCase(supabase).execute(ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MatchApplicationUseCase', () => {
  it('explains that "Other" training requests cannot be matched (no requirements)', async () => {
    const matcher = { match: vi.fn() };
    const { supabase } = supabaseStub({ applications: { data: { id: ID, status: 'NEW', internship_id: null, extracted_data: {} } } });
    await expect(new MatchApplicationUseCase(supabase, matcher as never).execute(ID))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(matcher.match).not.toHaveBeenCalled();
  });
});
