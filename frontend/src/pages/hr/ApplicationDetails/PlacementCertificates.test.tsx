// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationDetails } from '@/features/applications/types';
import type { HrCertificate } from '@/features/certificates/types';

const certificatesApi = vi.hoisted(() => ({ listPlacementCertificates: vi.fn(), reissueCertificate: vi.fn() }));
const placementApi = vi.hoisted(() => ({
  getHrApplicationPlacement: vi.fn(),
  getHrMentors: vi.fn(),
  activateHrInternPlacement: vi.fn(),
  cancelHrInternPlacement: vi.fn(),
  completeHrInternPlacement: vi.fn(),
  createHrInternPlacement: vi.fn(),
  assignHrPlacementMentor: vi.fn(),
  unassignHrPlacementMentor: vi.fn(),
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'hr-1' } }) }));
vi.mock('@/features/certificates/certificates.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/certificates/certificates.service')>()),
  ...certificatesApi,
}));
vi.mock('@/features/hr/services/intern-placement.service', () => placementApi);
vi.mock('@/features/internships/services/internships.service', () => ({}));

import { CertificateRequestError } from '@/features/certificates/certificates.service';

import PlacementCertificates from './PlacementCertificates';
import PlacementSection from './PlacementSection';

const original: HrCertificate = {
  id: 'cert-1', placementId: 'placement-id', status: 'SUPERSEDED', issueKind: 'COMPLETION',
  certificateTitle: 'Certificate of Completion', issuerName: 'Progineer Technologies',
  recipientName: 'Intern One', trainingTitle: 'Engineering', completionDate: '2026-03-11',
  issuedAt: '2026-03-10T22:30:05Z', issuedByName: 'HR One', supersedesCertificateId: null,
  reissueReason: null, supersededAt: '2026-04-01T08:00:00Z',
  placementStartDate: '2026-01-04', duration: { months: 2, days: 8 },
  hrSignatoryName: 'HR One', mentorSignatoryName: 'Mentor One',
};
const current: HrCertificate = {
  ...original, id: 'cert-2', status: 'ISSUED', issueKind: 'REISSUE', recipientName: 'Intern One Renamed',
  issuedAt: '2026-04-01T08:00:00Z', supersedesCertificateId: 'cert-1', reissueReason: 'Name corrected', supersededAt: null,
};
const issued: HrCertificate = { ...original, status: 'ISSUED', supersededAt: null };

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderPanel(client = newClient()) {
  render(<QueryClientProvider client={client}><PlacementCertificates applicationId="application-id" placementId="placement-id" /></QueryClientProvider>);
  return client;
}

async function openReissue() {
  fireEvent.click(await screen.findByRole('button', { name: 'Reissue certificate' }));
  return screen.findByRole('dialog');
}

describe('HR placement certificates', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('loads the history for the placement and shows the current and superseded versions', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([original, current]);
    renderPanel();
    const currentRecord = await screen.findByTestId('certificate-issued');
    expect(certificatesApi.listPlacementCertificates).toHaveBeenCalledWith('placement-id');
    expect(within(currentRecord).getByText('Current')).toBeTruthy();
    expect(within(currentRecord).getByText('Reissued')).toBeTruthy();
    expect(within(currentRecord).getByText('Intern One Renamed')).toBeTruthy();
    expect(within(currentRecord).getByText('Name corrected')).toBeTruthy();
    expect(within(currentRecord).getByText('11 March 2026')).toBeTruthy();
    expect(within(currentRecord).getByText('Engineering')).toBeTruthy();
    expect(within(currentRecord).getByText(/2 months and 8 days/)).toBeTruthy();
    expect(within(currentRecord).getByText('(4 January 2026 – 11 March 2026)')).toBeTruthy();
    expect(within(currentRecord).getByText('Mentor One')).toBeTruthy();
    expect(screen.queryByRole('note', { name: 'Missing certificate details' })).toBeNull();
    const old = screen.getByTestId('certificate-superseded');
    expect(within(old).getByText('Superseded')).toBeTruthy();
    expect(within(old).getByText('Intern One')).toBeTruthy();
    expect(within(old).getByText('Issued on completion')).toBeTruthy();
    expect(within(old).queryByRole('button')).toBeNull();
    expect(screen.queryByText(/certificate number/i)).toBeNull();
  });

  it('tells HR which details a legacy certificate could not state, and what to do', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([{
      ...issued, issueKind: 'BACKFILL', hrSignatoryName: null, mentorSignatoryName: null, duration: null,
    }]);
    renderPanel();
    const note = await screen.findByRole('note', { name: 'Missing certificate details' });
    expect(note.textContent).toMatch(/HR user who completed this placement could not be determined/);
    expect(note.textContent).toMatch(/no Mentor with a recorded name/);
    expect(note.textContent).toMatch(/duration could not be determined/);
    const record = screen.getByTestId('certificate-issued');
    // The training is always stated (the internship title); only the unknown details are flagged.
    expect(within(record).getByText('Engineering')).toBeTruthy();
    expect(within(record).getAllByText('Not recorded')).toHaveLength(2);
  });

  it('shows a backfilled certificate without an issuer name', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([{ ...issued, issueKind: 'BACKFILL', issuedByName: null }]);
    renderPanel();
    expect(await screen.findByText('Issued for an earlier completion')).toBeTruthy();
    expect(screen.queryByText(/ by /)).toBeNull();
  });

  it('shows a load error with a retry', async () => {
    certificatesApi.listPlacementCertificates.mockRejectedValue(new CertificateRequestError({ outcome: 'not-applied', status: 500, code: 'CERTIFICATE_SERVER_ERROR' }));
    renderPanel();
    expect((await screen.findByRole('alert')).textContent).toContain('Certificates are not available right now');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('requires a non-blank reason of at most 1000 characters before sending anything', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([issued]);
    renderPanel();
    const dialog = await openReissue();
    const submit = within(dialog).getByRole('button', { name: 'Reissue certificate' });
    fireEvent.click(submit);
    expect(within(dialog).getByText('Give a reason for reissuing the certificate.')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '    ' } });
    fireEvent.click(submit);
    expect(within(dialog).getByText('Give a reason for reissuing the certificate.')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'x'.repeat(1001) } });
    fireEvent.click(submit);
    expect(within(dialog).getByText('The reason can be at most 1,000 characters.')).toBeTruthy();
    expect(within(dialog).getByText('1,001 / 1,000')).toBeTruthy();
    expect(certificatesApi.reissueCertificate).not.toHaveBeenCalled();
  });

  it('sends the trimmed reason once, blocks a second submission while pending, and reports success only after the API confirms', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValueOnce([issued]);
    let confirm: (value: HrCertificate) => void = () => undefined;
    certificatesApi.reissueCertificate.mockReturnValue(new Promise((done) => { confirm = done; }));
    const client = renderPanel();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const dialog = await openReissue();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '  Name corrected  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reissue certificate' }));

    const pending = await within(dialog).findByRole('button', { name: 'Reissuing…' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.submit(pending.closest('form') as HTMLFormElement);
    expect(certificatesApi.reissueCertificate).toHaveBeenCalledTimes(1);
    expect(certificatesApi.reissueCertificate).toHaveBeenCalledWith('cert-1', 'Name corrected');
    expect(screen.queryByText(/Certificate reissued/)).toBeNull();

    certificatesApi.listPlacementCertificates.mockResolvedValue([{ ...original }, current]);
    await act(async () => { confirm(current); });
    expect((await screen.findByRole('status')).textContent).toContain('Certificate reissued');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hr', 'hr-1', 'placement-certificates', 'placement-id'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['hr', 'application-placement', 'application-id'] });
    expect(await screen.findByText('Intern One Renamed')).toBeTruthy();
  });

  it('shows a server refusal and keeps the dialog open without claiming success', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([issued]);
    certificatesApi.reissueCertificate.mockRejectedValue(new CertificateRequestError({ outcome: 'not-applied', status: 403, code: 'CERTIFICATE_ACCESS_DENIED' }));
    renderPanel();
    const dialog = await openReissue();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fix' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reissue certificate' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('You do not have access to this certificate.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(certificatesApi.listPlacementCertificates).toHaveBeenCalledTimes(1);
  });

  it('reloads the history when the certificate was already replaced', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([issued]);
    certificatesApi.reissueCertificate.mockRejectedValue(new CertificateRequestError({ outcome: 'not-applied', status: 409, code: 'CERTIFICATE_NOT_CURRENT' }));
    renderPanel();
    const dialog = await openReissue();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fix' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reissue certificate' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/already been replaced/);
    await waitFor(() => expect(certificatesApi.listPlacementCertificates).toHaveBeenCalledTimes(2));
  });

  it('does not report failure when the outcome is unknown, and reloads instead', async () => {
    certificatesApi.listPlacementCertificates.mockResolvedValue([issued]);
    certificatesApi.reissueCertificate.mockRejectedValue(new CertificateRequestError({ outcome: 'unknown' }));
    renderPanel();
    const dialog = await openReissue();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fix' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reissue certificate' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/not known whether the certificate was reissued/);
    await waitFor(() => expect(certificatesApi.listPlacementCertificates).toHaveBeenCalledTimes(2));
    expect(certificatesApi.reissueCertificate).toHaveBeenCalledTimes(1);
  });
});

describe('PlacementSection: certificate panel', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  const placement = {
    id: 'placement-id', applicationId: 'application-id', applicantId: 'applicant-id', internshipId: 'internship-id',
    company: 'Example Co', department: null, startDate: '2026-01-01', endDate: '2026-03-01', mentorProfileId: 'mentor-one',
    cancelledAt: null, cancellationReason: null, completionNote: null, createdAt: 'c', updatedAt: 'u',
  };
  const overview = (status: string, completed: boolean) => ({
    current: { ...placement, status, completedAt: completed ? '2026-03-10T22:30:00Z' : null, endedEarly: completed ? false : null },
    cancelled: [], trainingTitle: 'Engineering', selectionStatus: 'OPEN', capacity: 3, seatsConsumed: 1,
    selectionReleased: false, history: [],
  });

  function renderSection() {
    placementApi.getHrMentors.mockResolvedValue([]);
    render(
      <QueryClientProvider client={newClient()}>
        <PlacementSection application={{ id: 'application-id' } as unknown as ApplicationDetails} />
      </QueryClientProvider>,
    );
  }

  it('shows the certificate of a completed placement and offers no separate issue action', async () => {
    placementApi.getHrApplicationPlacement.mockResolvedValue(overview('COMPLETED', true));
    certificatesApi.listPlacementCertificates.mockResolvedValue([issued]);
    renderSection();
    expect(await screen.findByText('Certificate of completion')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /issue certificate$/i })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Reissue certificate' })).toBeTruthy();
  });

  it('asks HR for no training or type when completing (the internship is already known)', async () => {
    placementApi.getHrApplicationPlacement.mockResolvedValue(overview('ACTIVE', false));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Complete placement' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(within(dialog).queryByText(/type/i)).toBeNull();
    expect(within(dialog).getByText(/issues\s+the intern’s certificate of completion/)).toBeTruthy();
  });

  it('shows no certificate panel before completion', async () => {
    placementApi.getHrApplicationPlacement.mockResolvedValue(overview('ACTIVE', false));
    renderSection();
    expect(await screen.findByRole('button', { name: 'Complete placement' })).toBeTruthy();
    expect(screen.queryByText('Certificate of completion')).toBeNull();
    expect(certificatesApi.listPlacementCertificates).not.toHaveBeenCalled();
  });
});
