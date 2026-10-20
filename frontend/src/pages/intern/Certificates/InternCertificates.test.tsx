// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listMyCertificates: vi.fn(), getMyCertificate: vi.fn() }));
const auth = vi.hoisted(() => ({ userId: 'intern-1' }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: auth.userId } }) }));
vi.mock('@/features/certificates/certificates.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/certificates/certificates.service')>()),
  ...api,
}));

import { CertificateRequestError } from '@/features/certificates/certificates.service';

import InternCertificateDetail from './InternCertificateDetail';
import InternCertificates from './InternCertificates';

const certificate = {
  placementId: '11111111-1111-4111-8111-111111111111',
  certificateTitle: 'Certificate of Completion',
  issuerName: 'Progineer Technologies',
  recipientName: 'Intern One',
  trainingTitle: 'Frontend Developer',
  duration: { months: 3, days: 0 },
  completionDate: '2026-03-11',
  hrSignatoryName: 'Hala Example',
  mentorSignatoryName: 'Omar Example',
  issuedAt: '2026-03-10T22:30:05Z',
};

function renderAt(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/intern/certificates" element={<InternCertificates />} />
          <Route path="/intern/certificates/:placementId" element={<InternCertificateDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe('Intern certificates list', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows a loading state, then each certificate with its date and a link by placement', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    api.listMyCertificates.mockReturnValue(new Promise((done) => { resolve = done; }));
    renderAt('/intern/certificates');
    expect(screen.getByText('Loading your certificates…')).toBeTruthy();
    await act(async () => { resolve([certificate]); });
    expect(await screen.findByText('Frontend Developer')).toBeTruthy();
    expect(screen.getByText('Completed on 11 March 2026')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/intern/certificates/${certificate.placementId}`);
  });

  it('shows an empty state when there is no certificate', async () => {
    api.listMyCertificates.mockResolvedValue([]);
    renderAt('/intern/certificates');
    expect(await screen.findByText('No certificates yet')).toBeTruthy();
    expect(screen.getByText(/once HR has officially completed your internship/)).toBeTruthy();
  });

  it('shows an error with a retry, never database text', async () => {
    api.listMyCertificates.mockRejectedValueOnce(new CertificateRequestError({ outcome: 'not-applied', status: 500, code: 'CERTIFICATE_SERVER_ERROR' }));
    renderAt('/intern/certificates');
    expect(await screen.findByText('Unable to load your certificates')).toBeTruthy();
    expect(screen.getByText('Certificates are not available right now. Try again later.')).toBeTruthy();
    api.listMyCertificates.mockResolvedValueOnce([certificate]);
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Frontend Developer')).toBeTruthy();
  });

  it('never shows certificates cached for another user (user-scoped query keys)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['intern', 'intern-2', 'certificates'], [{ ...certificate, trainingTitle: 'Another intern\'s training' }]);
    api.listMyCertificates.mockResolvedValue([]);
    renderAt('/intern/certificates', client);
    expect(await screen.findByText('No certificates yet')).toBeTruthy();
    expect(screen.queryByText(/Another intern/)).toBeNull();
  });
});

describe('Intern certificate detail', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); document.title = ''; });

  it('loads the certificate by placement and shows exactly the certificate content', async () => {
    api.getMyCertificate.mockResolvedValue(certificate);
    renderAt(`/intern/certificates/${certificate.placementId}`);
    const preview = await screen.findByTestId('certificate-preview');
    expect(api.getMyCertificate).toHaveBeenCalledWith(certificate.placementId);
    const sheet = within(preview);
    expect(sheet.getByRole('heading', { name: 'Certificate of Completion' })).toBeTruthy();
    expect(sheet.getByRole('img', { name: 'Progineer Technologies' })).toBeTruthy();
    expect(sheet.getByText('This certificate is proudly presented to')).toBeTruthy();
    expect(sheet.getByText('Intern One')).toBeTruthy();
    expect(within(sheet.getByTestId('certificate-internship-details')).getByText('Frontend Developer')).toBeTruthy();
    expect(sheet.getByTestId('certificate-internship-details').textContent)
      .toBe('who completed a 3-month internship as Frontend Developerat Progineer Technologies');
    expect(sheet.getByTestId('signature-hr').textContent).toBe('Hala ExampleHR Signature');
    expect(sheet.getByTestId('signature-mentor').textContent).toBe('Omar ExampleMentor Signature');
    expect(sheet.getByText('11 March 2026').getAttribute('datetime')).toBe('2026-03-11');
  });

  it('renders a legacy certificate with unknown details without placeholders', async () => {
    api.getMyCertificate.mockResolvedValue({
      ...certificate, duration: null, hrSignatoryName: null, mentorSignatoryName: null,
    });
    renderAt(`/intern/certificates/${certificate.placementId}`);
    const preview = await screen.findByTestId('certificate-preview');
    expect(within(preview).getByTestId('certificate-internship-details').textContent)
      .toBe('who completed an internship as Frontend Developerat Progineer Technologies');
    expect(within(preview).getByTestId('signature-hr').textContent).toBe('HR Signature');
    expect(preview.textContent).not.toMatch(/undefined|null|@/);
  });

  it('shows no number, internal id, signature image, seal or invented signatory', async () => {
    api.getMyCertificate.mockResolvedValue({ ...certificate, hrSignatoryName: null, mentorSignatoryName: null });
    renderAt(`/intern/certificates/${certificate.placementId}`);
    const preview = await screen.findByTestId('certificate-preview');
    expect(preview.textContent).not.toMatch(/number|No\.|#|signed|seal|stamp/i);
    expect(preview.textContent).not.toContain(certificate.placementId);
    // The only image is the issuer's logo; the signature areas are blank
    // lines with their labels (no names printed when none was recorded).
    expect([...preview.querySelectorAll('img, svg, canvas')].map((element) => element.getAttribute('alt'))).toEqual(['Progineer Technologies']);
    for (const role of ['hr', 'mentor']) {
      const area = within(preview).getByTestId(`signature-${role}`);
      expect(area.querySelector('img, svg, canvas, .certificate-signature-name')).toBeNull();
    }
    expect(within(preview).getByText('HR Signature')).toBeTruthy();
    expect(within(preview).getByText('Mentor Signature')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/reissue|superseded|reason/i);
  });

  it('keeps long and right-to-left names on the page (smaller type, own direction)', async () => {
    api.getMyCertificate.mockResolvedValue({
      ...certificate,
      recipientName: 'محمد عبد الرحمن إبراهيم الخطيب بن عبد الله الحسيني',
      trainingTitle: 'Full-Stack Web Development and Cloud Infrastructure Operations',
      duration: { months: 11, days: 29 },
    });
    renderAt(`/intern/certificates/${certificate.placementId}`);
    const preview = await screen.findByTestId('certificate-preview');
    const name = preview.querySelector('.certificate-recipient') as HTMLElement;
    const details = within(preview).getByTestId('certificate-internship-details');
    expect(name.getAttribute('dir')).toBe('auto');
    expect(name.dataset.fit).toBe('sm');
    expect(within(details).getByText('Full-Stack Web Development and Cloud Infrastructure Operations').getAttribute('dir')).toBe('auto');
    expect(details.querySelector('p')?.textContent)
      .toBe('who completed an 11-month, 29-day internship as Full-Stack Web Development and Cloud Infrastructure Operations');
    expect(details.dataset.fit).toBe('sm');
  });

  it('prints through the browser dialog, naming the PDF after the certificate', async () => {
    api.getMyCertificate.mockResolvedValue(certificate);
    document.title = 'Internship Portal';
    let titleWhilePrinting = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => { titleWhilePrinting = document.title; });
    renderAt(`/intern/certificates/${certificate.placementId}`);
    fireEvent.click(await screen.findByRole('button', { name: /Print/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save as PDF/ }));
    expect(print).toHaveBeenCalledTimes(2);
    expect(titleWhilePrinting).toBe('Certificate of Completion - Intern One');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Internship Portal');
  });

  it('adds a print-only copy of the sheet directly under <body>, hidden from assistive technology', async () => {
    api.getMyCertificate.mockResolvedValue(certificate);
    renderAt(`/intern/certificates/${certificate.placementId}`);
    const copy = await screen.findByTestId('certificate-print-copy');
    expect(copy.parentElement).toBe(document.body);
    expect(copy.className).toBe('certificate-print-portal');
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.textContent).toContain('Intern One');
    // Buttons and navigation are not part of the printed copy.
    expect(copy.querySelector('button, a, nav')).toBeNull();
  });

  it('removes the print copy when leaving the page', async () => {
    api.getMyCertificate.mockResolvedValue(certificate);
    renderAt(`/intern/certificates/${certificate.placementId}`);
    await screen.findByTestId('certificate-print-copy');
    cleanup();
    expect(document.querySelector('.certificate-print-portal')).toBeNull();
  });

  it('explains when the certificate is not available (another intern\'s or not completed)', async () => {
    api.getMyCertificate.mockRejectedValue(new CertificateRequestError({ outcome: 'not-applied', status: 404, code: 'CERTIFICATE_NOT_FOUND' }));
    renderAt(`/intern/certificates/${certificate.placementId}`);
    expect(await screen.findByText('Unable to load this certificate')).toBeTruthy();
    expect(screen.getByText(/only after HR has completed the internship/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Print/ })).toBeNull();
    expect(document.querySelector('.certificate-print-portal')).toBeNull();
  });
});
