import { HttpException, Logger } from '@nestjs/common';

import { SupabaseCertificateRepository } from './supabase-certificate.repository.js';

const INTERN = 'intern-auth-id';
const HR = 'hr-profile-id';
const PLACEMENT = 'placement-1';

const internRow = {
  placement_id: PLACEMENT,
  certificate_title: 'Certificate of Completion',
  issuer_name: 'Progineer Technologies',
  recipient_name: 'Intern One',
  training_title: 'Engineering',
  completion_date: '2026-03-11',
  issued_at: '2026-03-10T22:30:05+00:00',
  duration_months: 2,
  duration_days: 8,
  hr_signatory_name: 'Hala HR',
  mentor_signatory_name: 'Mona Mentor',
};

const issuedRow = {
  certificate_id: 'cert-1',
  ...internRow,
  status: 'ISSUED',
  issue_kind: 'COMPLETION',
  issued_by_name: 'HR',
  supersedes_certificate_id: null,
  reissue_reason: null,
  superseded_at: null,
  placement_start_date: '2026-01-04',
};

const supersededRow = { ...issuedRow, status: 'SUPERSEDED', superseded_at: '2026-04-01T08:00:00+00:00' };
const reissuedRow = {
  ...issuedRow,
  certificate_id: 'cert-2',
  issue_kind: 'REISSUE',
  recipient_name: 'Intern One Renamed',
  supersedes_certificate_id: 'cert-1',
  reissue_reason: 'Name corrected',
};

function repositoryReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc, repository: new SupabaseCertificateRepository({ client: { rpc } } as never) };
}

const INTERN_KEYS = ['certificateTitle', 'completionDate', 'duration', 'hrSignatoryName', 'issuedAt', 'issuerName',
  'mentorSignatoryName', 'placementId', 'recipientName', 'trainingTitle'];

describe('SupabaseCertificateRepository', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls the exact function names and arguments of the migration', async () => {
    const { rpc, repository } = repositoryReturning({ data: [internRow], error: null });
    await repository.listForIntern(INTERN);
    expect(rpc).toHaveBeenLastCalledWith('list_my_certificates', { p_auth_user_id: INTERN });
    await repository.getForIntern(INTERN, PLACEMENT);
    expect(rpc).toHaveBeenLastCalledWith('get_my_certificate', { p_auth_user_id: INTERN, p_placement_id: PLACEMENT });

    rpc.mockResolvedValue({ data: [issuedRow], error: null });
    await repository.listForHrPlacement(HR, PLACEMENT);
    expect(rpc).toHaveBeenLastCalledWith('list_hr_placement_certificates', { p_actor_profile_id: HR, p_placement_id: PLACEMENT });
    await repository.reissueForHr(HR, 'cert-1', 'Name corrected');
    expect(rpc).toHaveBeenLastCalledWith('reissue_internship_certificate', {
      p_actor_profile_id: HR, p_certificate_id: 'cert-1', p_reason: 'Name corrected',
    });

    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rpc.mock.calls.some(([name]) => name === 'internship_certificate_issue')).toBe(false);
  });

  it('maps the intern view exactly, with no id, status, reason, history or number', async () => {
    const { repository } = repositoryReturning({ data: [internRow], error: null });
    const [certificate] = await repository.listForIntern(INTERN);
    expect(certificate).toEqual({
      placementId: PLACEMENT,
      certificateTitle: 'Certificate of Completion',
      issuerName: 'Progineer Technologies',
      recipientName: 'Intern One',
      trainingTitle: 'Engineering',
      duration: { months: 2, days: 8 },
      completionDate: '2026-03-11',
      hrSignatoryName: 'Hala HR',
      mentorSignatoryName: 'Mona Mentor',
      issuedAt: '2026-03-10T22:30:05+00:00',
    });
    expect(Object.keys(certificate).sort()).toEqual(INTERN_KEYS);
  });

  it('keeps unknown details unknown (legacy certificates): nulls, never placeholders', async () => {
    const { repository } = repositoryReturning({
      data: [{ ...internRow, duration_months: null, duration_days: null, hr_signatory_name: null, mentor_signatory_name: null }],
      error: null,
    });
    await expect(repository.getForIntern(INTERN, PLACEMENT)).resolves.toMatchObject({
      trainingTitle: 'Engineering', duration: null, hrSignatoryName: null, mentorSignatoryName: null,
    });
  });

  it('never passes extra database fields on to the intern', async () => {
    const leaky = { ...internRow, certificate_id: 'cert-1', id: 'cert-1', reissue_reason: 'Secret', certificate_number: 'C-1', status: 'ISSUED',
      placement_start_date: '2026-01-04', company: 'Some Other Co' };
    const { repository } = repositoryReturning({ data: [leaky], error: null });
    const certificate = await repository.getForIntern(INTERN, PLACEMENT);
    expect(Object.keys(certificate).sort()).toEqual(INTERN_KEYS);
    expect(JSON.stringify(certificate)).not.toMatch(/cert-1|Secret|C-1|ISSUED|2026-01-04|Some Other Co/);
  });

  it('returns an empty intern list as is', async () => {
    const { repository } = repositoryReturning({ data: [], error: null });
    await expect(repository.listForIntern(INTERN)).resolves.toEqual([]);
  });

  it('maps the HR history, current and superseded, in database order', async () => {
    const { repository } = repositoryReturning({ data: [supersededRow, reissuedRow], error: null });
    await expect(repository.listForHrPlacement(HR, PLACEMENT)).resolves.toEqual([
      {
        id: 'cert-1', placementId: PLACEMENT, status: 'SUPERSEDED', issueKind: 'COMPLETION',
        certificateTitle: 'Certificate of Completion', issuerName: 'Progineer Technologies',
        recipientName: 'Intern One', trainingTitle: 'Engineering', completionDate: '2026-03-11',
        issuedAt: '2026-03-10T22:30:05+00:00', issuedByName: 'HR', supersedesCertificateId: null,
        reissueReason: null, supersededAt: '2026-04-01T08:00:00+00:00',
        placementStartDate: '2026-01-04', duration: { months: 2, days: 8 },
        hrSignatoryName: 'Hala HR', mentorSignatoryName: 'Mona Mentor',
      },
      {
        id: 'cert-2', placementId: PLACEMENT, status: 'ISSUED', issueKind: 'REISSUE',
        certificateTitle: 'Certificate of Completion', issuerName: 'Progineer Technologies',
        recipientName: 'Intern One Renamed', trainingTitle: 'Engineering', completionDate: '2026-03-11',
        issuedAt: '2026-03-10T22:30:05+00:00', issuedByName: 'HR', supersedesCertificateId: 'cert-1',
        reissueReason: 'Name corrected', supersededAt: null,
        placementStartDate: '2026-01-04', duration: { months: 2, days: 8 },
        hrSignatoryName: 'Hala HR', mentorSignatoryName: 'Mona Mentor',
      },
    ]);
  });

  it('accepts a backfilled certificate without an issuer name', async () => {
    const { repository } = repositoryReturning({ data: [{ ...issuedRow, issue_kind: 'BACKFILL', issued_by_name: null }], error: null });
    await expect(repository.listForHrPlacement(HR, PLACEMENT)).resolves.toMatchObject([{ issueKind: 'BACKFILL', issuedByName: null }]);
  });

  it('returns the new record of a reissue', async () => {
    const { repository } = repositoryReturning({ data: [reissuedRow], error: null });
    await expect(repository.reissueForHr(HR, 'cert-1', 'Name corrected')).resolves.toMatchObject({
      id: 'cert-2', status: 'ISSUED', issueKind: 'REISSUE', supersedesCertificateId: 'cert-1', reissueReason: 'Name corrected',
    });
  });

  it.each([
    ['not an array', { data: null }],
    ['a single object', { data: internRow }],
    ['a blank name', { data: [{ ...internRow, recipient_name: '' }] }],
    ['a non-date completion date', { data: [{ ...internRow, completion_date: '2026-03-11T00:00:00Z' }] }],
    ['a missing title', { data: [{ ...internRow, certificate_title: undefined }] }],
    ['a blank training title', { data: [{ ...internRow, training_title: '' }] }],
    ['half a duration', { data: [{ ...internRow, duration_days: null }] }],
    ['a negative duration', { data: [{ ...internRow, duration_months: -1 }] }],
    ['a fractional duration', { data: [{ ...internRow, duration_days: 1.5 }] }],
    ['a blank signatory name', { data: [{ ...internRow, mentor_signatory_name: ' '.repeat(0) }] }],
    ['a missing signatory field', { data: [{ ...internRow, hr_signatory_name: undefined }] }],
  ])('refuses an unexpected intern result (%s) with a 500', async (_label, result) => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { repository } = repositoryReturning({ ...result, error: null });
    await expect(repository.listForIntern(INTERN)).rejects.toMatchObject({ status: 500 });
  });

  it.each([
    ['zero rows', []],
    ['two rows', [internRow, internRow]],
  ])('requires exactly one row for a single intern certificate (%s)', async (_label, data) => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { repository } = repositoryReturning({ data, error: null });
    await expect(repository.getForIntern(INTERN, PLACEMENT)).rejects.toMatchObject({ status: 500 });
  });

  it.each([
    ['an unknown status', { ...issuedRow, status: 'REVOKED' }],
    ['an unknown kind', { ...issuedRow, issue_kind: 'MANUAL' }],
    ['a reissue without a reason', { ...reissuedRow, reissue_reason: null }],
    ['a reason without a reissue', { ...issuedRow, reissue_reason: 'x' }],
    ['a superseded record without a date', { ...supersededRow, superseded_at: null }],
    ['a missing id', { ...issuedRow, certificate_id: null }],
    ['a malformed start date', { ...issuedRow, placement_start_date: '04/01/2026' }],
  ])('refuses an inconsistent HR record (%s) with a 500', async (_label, row) => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { repository } = repositoryReturning({ data: [row], error: null });
    await expect(repository.listForHrPlacement(HR, PLACEMENT)).rejects.toMatchObject({ status: 500 });
  });

  it.each([
    ['intern_role_required', 'PZ403', 403, 'CERTIFICATE_ACCESS_DENIED'],
    ['certificate_not_found', 'PZ404', 404, 'CERTIFICATE_NOT_FOUND'],
  ])('maps intern errors: %s', async (message, code, status, errorCode) => {
    const { repository } = repositoryReturning({ data: null, error: { code, message } });
    const error = await repository.getForIntern(INTERN, PLACEMENT).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code: errorCode });
  });

  it.each([
    ['hr_role_required', 'PZ403', 403, 'CERTIFICATE_ACCESS_DENIED'],
    ['certificate_not_found', 'PZ404', 404, 'CERTIFICATE_NOT_FOUND'],
    ['certificate_not_current', 'PZ409', 409, 'CERTIFICATE_NOT_CURRENT'],
    ['placement_not_completed', 'PZ409', 409, 'PLACEMENT_NOT_COMPLETED'],
    ['certificate_source_incomplete', 'PZ409', 409, 'CERTIFICATE_SOURCE_INCOMPLETE'],
    ['reissue_reason_required', 'PZ400', 400, 'REISSUE_REASON_REQUIRED'],
    ['reissue_reason_too_long', 'PZ400', 400, 'REISSUE_REASON_TOO_LONG'],
  ])('maps reissue errors: %s', async (message, code, status, errorCode) => {
    const { repository } = repositoryReturning({ data: null, error: { code, message } });
    const error = await repository.reissueForHr(HR, 'cert-1', 'Fix').catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(status);
    expect((error as HttpException).getResponse()).toMatchObject({ code: errorCode });
  });

  it('maps an unknown placement on the HR list', async () => {
    const { repository } = repositoryReturning({ data: null, error: { code: 'PZ404', message: 'placement_not_found' } });
    await expect(repository.listForHrPlacement(HR, PLACEMENT)).rejects.toMatchObject({ status: 404 });
  });

  it('logs unexpected database errors with the function and a sanitized code only', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { repository } = repositoryReturning({
      data: null,
      error: { code: 'PZ409', message: 'certificate_immutable', details: 'Intern One / Name corrected' },
    });
    await expect(repository.reissueForHr(HR, 'cert-1', 'Name corrected')).rejects.toMatchObject({ status: 500 });
    expect(log).toHaveBeenCalledWith('Certificate database call failed: function=reissue_internship_certificate code=PZ409');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Intern One|Name corrected|hr-profile-id|cert-1/);
  });

  it('does not log expected conditions', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { repository } = repositoryReturning({ data: null, error: { code: 'PZ404', message: 'certificate_not_found' } });
    await expect(repository.getForIntern(INTERN, PLACEMENT)).rejects.toMatchObject({ status: 404 });
    expect(log).not.toHaveBeenCalled();
  });
});
