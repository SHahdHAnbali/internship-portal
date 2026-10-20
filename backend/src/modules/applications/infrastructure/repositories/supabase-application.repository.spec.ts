import { InternalServerErrorException } from '@nestjs/common';

import { SupabaseApplicationRepository } from './supabase-application.repository.js';

const HASH = 'a'.repeat(64);

// Records the query the repository builds; resolves to `result`.
function client(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const query: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'neq']) {
    query[name] = (...args: unknown[]) => { calls.push([name, ...args]); return query; };
  }
  // `not` and `limit` end the queries under test.
  for (const name of ['not', 'limit']) {
    query[name] = (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(result); };
  }
  const from = vi.fn((table: string) => { calls.push(['from', table]); return query; });
  return { repository: new SupabaseApplicationRepository({ client: { from } } as never), calls };
}

describe('SupabaseApplicationRepository.hasPreviousUploadOfCv', () => {
  it('searches every application by CV fingerprint: no training, applicant or status filter', async () => {
    const { repository, calls } = client({ data: [{ id: 'other-application' }], error: null });
    await expect(repository.hasPreviousUploadOfCv(HASH, null)).resolves.toBe(true);
    expect(calls).toEqual([['from', 'applications'], ['select', 'id'], ['eq', 'cv_sha256', HASH], ['limit', 1]]);
  });

  it('leaves out the application being reviewed', async () => {
    const { repository, calls } = client({ data: [], error: null });
    await expect(repository.hasPreviousUploadOfCv(HASH, 'this-draft')).resolves.toBe(false);
    expect(calls).toContainEqual(['neq', 'id', 'this-draft']);
  });

  it('fails instead of answering "not uploaded" when the query fails', async () => {
    const { repository } = client({ data: null, error: { message: 'boom' } });
    await expect(repository.hasPreviousUploadOfCv(HASH, null)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

describe('SupabaseApplicationRepository.hasSubmittedApplicationForCv', () => {
  it('matches a submitted application with this CV whatever its training or status (only DRAFT is left out)', async () => {
    const { repository, calls } = client({ data: [{ id: 'earlier' }], error: null });
    await expect(repository.hasSubmittedApplicationForCv(HASH, null)).resolves.toBe(true);
    expect(calls).toEqual([['from', 'applications'], ['select', 'id'], ['eq', 'cv_sha256', HASH], ['neq', 'status', 'DRAFT'], ['limit', 1]]);
  });

  it('leaves out the application being reviewed, and answers false when nothing matches', async () => {
    const { repository, calls } = client({ data: [], error: null });
    await expect(repository.hasSubmittedApplicationForCv(HASH, 'this-draft')).resolves.toBe(false);
    expect(calls).toContainEqual(['neq', 'id', 'this-draft']);
  });

  it('fails instead of answering "not submitted" when the query fails', async () => {
    const { repository } = client({ data: null, error: { message: 'boom' } });
    await expect(repository.hasSubmittedApplicationForCv(HASH, null)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

// applicants: lookups end with eq/ilike. applications: select/in/eq/neq, ending with limit.
function eligibilityClient(options: {
  byAuth?: { id: string }[];
  byEmail?: { id: string; email: string | null }[];
  submittedForApplicants?: boolean;
  submittedForEmail?: boolean;
  error?: 'applicants' | 'applications';
}) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    const record = (name: string, args: unknown[]) => calls.push([table, name, ...args]);
    if (table === 'applicants') {
      query.select = (...args: unknown[]) => { record('select', args); return query; };
      query.eq = (...args: unknown[]) => {
        record('eq', args);
        return Promise.resolve(options.error === 'applicants' ? { data: null, error: { message: 'boom' } } : { data: options.byAuth ?? [], error: null });
      };
      query.ilike = (...args: unknown[]) => {
        record('ilike', args);
        return Promise.resolve(options.error === 'applicants' ? { data: null, error: { message: 'boom' } } : { data: options.byEmail ?? [], error: null });
      };
      return query;
    }
    let kind: 'applicants' | 'email' = 'email';
    for (const name of ['select', 'eq', 'neq', 'in']) {
      query[name] = (...args: unknown[]) => { record(name, args); if (name === 'in') kind = 'applicants'; return query; };
    }
    query.limit = (...args: unknown[]) => {
      record('limit', args);
      if (options.error === 'applications') return Promise.resolve({ data: null, error: { message: 'boom' } });
      const found = kind === 'applicants' ? options.submittedForApplicants : options.submittedForEmail;
      return Promise.resolve({ data: found ? [{ id: 'earlier' }] : [], error: null });
    };
    return query;
  });
  return { repository: new SupabaseApplicationRepository({ client: { from } } as never), calls };
}

describe('SupabaseApplicationRepository.hasSubmittedApplication (one application per applicant)', () => {
  it('counts every status except DRAFT, for any training and CV, linked to the applicant by Auth user or email', async () => {
    const { repository, calls } = eligibilityClient({ byAuth: [{ id: 'applicant-1' }], submittedForApplicants: true });
    await expect(repository.hasSubmittedApplication({ authUserId: 'auth-1', email: 'intern@example.com' })).resolves.toBe(true);
    expect(calls).toContainEqual(['applicants', 'eq', 'auth_user_id', 'auth-1']);
    expect(calls).toContainEqual(['applicants', 'ilike', 'email', 'intern@example.com']);
    expect(calls).toContainEqual(['applications', 'in', 'applicant_id', ['applicant-1']]);
    expect(calls).toContainEqual(['applications', 'neq', 'status', 'DRAFT']);
    // No training, CV or other status filter.
    expect(calls.filter((c) => c[0] === 'applications').map((c) => c[1])).not.toContain('not');
    expect(JSON.stringify(calls)).not.toMatch(/cv_sha256|internship_id|requested_training/);
  });

  it('finds an applicant row by email regardless of case, comparing the address exactly', async () => {
    const { repository, calls } = eligibilityClient({
      byEmail: [{ id: 'match', email: ' Applicant@Example.com ' }, { id: 'pattern-only', email: 'applicantXexample.com' }],
      submittedForApplicants: true,
    });
    await expect(repository.hasSubmittedApplication({ email: 'applicant@example.com' })).resolves.toBe(true);
    expect(calls).toContainEqual(['applications', 'in', 'applicant_id', ['match']]);
  });

  it('also finds a submitted application by its stored review email', async () => {
    const { repository, calls } = eligibilityClient({ submittedForEmail: true });
    await expect(repository.hasSubmittedApplication({ email: 'applicant@example.com' })).resolves.toBe(true);
    expect(calls).toContainEqual(['applications', 'eq', 'review_email', 'applicant@example.com']);
  });

  it('does not count an unsubmitted draft (DRAFT rows are filtered out) and lets a new applicant apply', async () => {
    const { repository } = eligibilityClient({});
    await expect(repository.hasSubmittedApplication({ authUserId: 'new-auth', email: 'new@example.com' })).resolves.toBe(false);
  });

  it('escapes LIKE wildcards in the email pattern', async () => {
    const { repository, calls } = eligibilityClient({});
    await repository.hasSubmittedApplication({ email: 'a_b%c*d@example.com' });
    expect(calls).toContainEqual(['applicants', 'ilike', 'email', 'a\\_b\\%c_d@example.com']);
  });

  it('needs an identity', async () => {
    const { repository, calls } = eligibilityClient({ submittedForEmail: true });
    await expect(repository.hasSubmittedApplication({})).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it.each(['applicants', 'applications'] as const)('fails instead of answering "eligible" when the %s query fails', async (table) => {
    const { repository } = eligibilityClient({ byAuth: [{ id: 'applicant-1' }], error: table });
    await expect(repository.hasSubmittedApplication({ authUserId: 'auth-1', email: 'a@example.com' }))
      .rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
