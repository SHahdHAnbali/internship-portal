import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  SESSION_EXPIRED_MESSAGE: 'session-expired',
  PASSWORD_SETUP_REQUIRED_MESSAGE: 'password-setup-required',
  IDENTITY_MISMATCH_MESSAGE: 'identity-mismatch',
  SESSION_RENEWED_MESSAGE: 'session-renewed',
  authenticatedFetch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => api);
vi.mock('@/config/env', () => ({ env: { apiUrl: 'http://api.test' } }));

import {
  CertificateRequestError,
  getMyCertificate,
  listMyCertificates,
  listPlacementCertificates,
  reissueCertificate,
} from './certificates.service';

const internCertificate = {
  placementId: 'p1',
  certificateTitle: 'Certificate of Completion',
  issuerName: 'Progineer Technologies',
  recipientName: 'Intern One',
  trainingTitle: 'Engineering',
  duration: { months: 2, days: 8 },
  completionDate: '2026-03-11',
  hrSignatoryName: 'Hala HR',
  mentorSignatoryName: 'Mona Mentor',
  issuedAt: '2026-03-10T22:30:05Z',
};

const hrCertificate = {
  id: 'cert-2', ...internCertificate, status: 'ISSUED', issueKind: 'REISSUE', issuedByName: 'HR',
  supersedesCertificateId: 'cert-1', reissueReason: 'Name corrected', supersededAt: null, placementStartDate: '2026-01-04',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function failure(promise: Promise<unknown>): Promise<CertificateRequestError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(CertificateRequestError);
  return error as CertificateRequestError;
}

describe('certificates service', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('lists the intern\'s certificates from the intern endpoint, uncached', async () => {
    api.authenticatedFetch.mockResolvedValue(json([internCertificate]));
    await expect(listMyCertificates()).resolves.toEqual([internCertificate]);
    const [url, init] = api.authenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/intern/me/certificates');
    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
    expect(init.body).toBeUndefined();
  });

  it('loads one certificate by placement id (the only identifier the intern has)', async () => {
    api.authenticatedFetch.mockResolvedValue(json(internCertificate));
    await getMyCertificate('p 1');
    expect(api.authenticatedFetch.mock.calls[0][0]).toBe('http://api.test/intern/me/certificates/p%201');
  });

  it('keeps only the documented intern fields, even if the server sent more', async () => {
    api.authenticatedFetch.mockResolvedValue(json({
      ...internCertificate, id: 'cert-1', certificateId: 'cert-1', certificateNumber: 'C-1', reissueReason: 'Secret', status: 'ISSUED',
      placementStartDate: '2026-01-04', duration: { months: 2, days: 8, total: 99 }, company: 'Some Other Co',
    }));
    const certificate = await getMyCertificate('p1');
    expect(certificate).toEqual(internCertificate);
    expect(JSON.stringify(certificate)).not.toMatch(/cert-1|C-1|Secret|ISSUED|2026-01-04|99|Some Other Co/);
  });

  it('lists HR history and sends a reissue with only the reason', async () => {
    api.authenticatedFetch.mockResolvedValueOnce(json([hrCertificate]));
    await expect(listPlacementCertificates('p1')).resolves.toEqual([hrCertificate]);
    expect(api.authenticatedFetch.mock.calls[0][0]).toBe('http://api.test/hr/placements/p1/certificates');

    api.authenticatedFetch.mockResolvedValueOnce(json(hrCertificate, 201));
    await expect(reissueCertificate('cert-1', 'Name corrected')).resolves.toEqual(hrCertificate);
    const [url, init] = api.authenticatedFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('http://api.test/hr/certificates/cert-1/reissue');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Name corrected' });
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('reports server errors with their code as not applied', async () => {
    api.authenticatedFetch.mockResolvedValue(json({ statusCode: 409, code: 'CERTIFICATE_NOT_CURRENT', message: 'x' }, 409));
    const error = await failure(reissueCertificate('cert-1', 'Fix'));
    expect(error).toMatchObject({ outcome: 'not-applied', status: 409, code: 'CERTIFICATE_NOT_CURRENT' });
  });

  it('derives a code from the status when the body has none', async () => {
    api.authenticatedFetch.mockResolvedValue(new Response('nope', { status: 404 }));
    expect(await failure(getMyCertificate('p1'))).toMatchObject({ outcome: 'not-applied', status: 404, code: 'CERTIFICATE_NOT_FOUND' });
  });

  it.each([
    ['session-expired', 'SESSION_EXPIRED'],
    ['password-setup-required', 'PASSWORD_SETUP_REQUIRED'],
    ['identity-mismatch', 'IDENTITY_MISMATCH'],
    ['session-renewed', 'SESSION_RENEWED'],
  ])('maps the API client refusal %s to %s (never sent or not applied)', async (message, code) => {
    api.authenticatedFetch.mockRejectedValue(new Error(message));
    expect(await failure(listMyCertificates())).toMatchObject({ outcome: 'not-applied', code });
  });

  it('treats a network failure during a reissue as an unknown outcome', async () => {
    api.authenticatedFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await failure(reissueCertificate('cert-1', 'Fix'))).outcome).toBe('unknown');
  });

  it.each([
    ['not an array', { ...internCertificate }],
    ['a missing name', [{ ...internCertificate, recipientName: '' }]],
    ['a date-time instead of a date', [{ ...internCertificate, completionDate: '2026-03-11T00:00:00Z' }]],
    ['a blank training title', [{ ...internCertificate, trainingTitle: '' }]],
    ['a malformed duration', [{ ...internCertificate, duration: { months: 2 } }]],
    ['a negative duration', [{ ...internCertificate, duration: { months: -1, days: 0 } }]],
    ['a blank signatory name', [{ ...internCertificate, mentorSignatoryName: '  ' }]],
    ['a missing signatory field', [{ ...internCertificate, hrSignatoryName: undefined }]],
  ])('refuses an unreadable success body (%s)', async (_label, body) => {
    api.authenticatedFetch.mockResolvedValue(json(body));
    expect((await failure(listMyCertificates())).outcome).toBe('unknown');
  });

  it('accepts a legacy certificate whose details are unknown (nulls)', async () => {
    const legacy = { ...internCertificate, duration: null, hrSignatoryName: null, mentorSignatoryName: null };
    api.authenticatedFetch.mockResolvedValue(json([legacy]));
    await expect(listMyCertificates()).resolves.toEqual([legacy]);
  });

  it('refuses an HR record with an unknown status', async () => {
    api.authenticatedFetch.mockResolvedValue(json([{ ...hrCertificate, status: 'REVOKED' }]));
    expect((await failure(listPlacementCertificates('p1'))).outcome).toBe('unknown');
  });
});
