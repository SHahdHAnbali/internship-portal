// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  SESSION_EXPIRED_MESSAGE: 'session-expired',
  PASSWORD_SETUP_REQUIRED_MESSAGE: 'password-setup-required',
  IDENTITY_MISMATCH_MESSAGE: 'identity-mismatch',
  SESSION_RENEWED_MESSAGE: 'session-renewed',
  authenticatedFetch: vi.fn(),
}));

import { CertificatePrintCopy, CertificateSheet, type CertificateContent } from './CertificateDocument';

// Fictional values only.
const certificate: CertificateContent = {
  certificateTitle: 'Certificate of Completion',
  issuerName: 'Progineer Technologies',
  recipientName: 'Lina Example',
  trainingTitle: 'Frontend Developer',
  duration: { months: 3, days: 0 },
  completionDate: '2026-03-11',
  hrSignatoryName: 'Hala Example',
  mentorSignatoryName: 'Omar Example',
};

const sheet = () => screen.getByRole('article');
const detailLines = () => [...screen.getByTestId('certificate-internship-details').querySelectorAll('p')].map((p) => p.textContent);

describe('CertificateSheet', () => {
  afterEach(() => { cleanup(); });

  it('uses the approved wording with the internship title as the training, the name most prominent', () => {
    render(<CertificateSheet certificate={certificate} />);
    expect(screen.getByRole('heading', { name: 'Certificate of Completion' })).toBeTruthy();
    const lead = screen.getByText('This certificate is proudly presented to');
    const name = screen.getByText('Lina Example');
    expect(lead.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.className).toBe('certificate-recipient');
    expect(detailLines()).toEqual([
      'who completed a 3-month internship as Frontend Developer',
      'at Progineer Technologies',
    ]);
    expect([...screen.getByTestId('certificate-internship-details').querySelectorAll('strong')].map((element) => element.textContent))
      .toEqual(['3-month', 'Frontend Developer', 'Progineer Technologies']);
  });

  it('states the actual duration in months and days, with the right article', () => {
    render(<CertificateSheet certificate={{ ...certificate, duration: { months: 2, days: 8 } }} />);
    expect(detailLines()[0]).toBe('who completed a 2-month, 8-day internship as Frontend Developer');
    cleanup();
    render(<CertificateSheet certificate={{ ...certificate, duration: { months: 8, days: 0 } }} />);
    expect(detailLines()[0]).toBe('who completed an 8-month internship as Frontend Developer');
    cleanup();
    render(<CertificateSheet certificate={{ ...certificate, duration: { months: 0, days: 1 } }} />);
    expect(detailLines()[0]).toBe('who completed a 1-day internship as Frontend Developer');
    cleanup();
    render(<CertificateSheet certificate={{ ...certificate, duration: { months: 0, days: 11 } }} />);
    expect(detailLines()[0]).toBe('who completed an 11-day internship as Frontend Developer');
  });

  it('keeps a title that already names the internship natural, without changing it', () => {
    render(<CertificateSheet certificate={{ ...certificate, trainingTitle: 'React Developer Internship' }} />);
    expect(detailLines()).toEqual(['who completed the 3-month React Developer Internship', 'at Progineer Technologies']);
    cleanup();
    render(<CertificateSheet certificate={{ ...certificate, trainingTitle: 'Summer internship', duration: null }} />);
    expect(detailLines()[0]).toBe('who completed the Summer internship');
    cleanup();
    // "Internships" in the middle of a title is not the same thing.
    render(<CertificateSheet certificate={{ ...certificate, trainingTitle: 'Internship Program Support' }} />);
    expect(detailLines()[0]).toBe('who completed a 3-month internship as Internship Program Support');
  });

  it('always states the training; an unknown duration is left out without placeholders', () => {
    render(<CertificateSheet certificate={{ ...certificate, duration: null }} />);
    expect(detailLines()).toEqual(['who completed an internship as Frontend Developer', 'at Progineer Technologies']);
    expect(sheet().textContent).not.toMatch(/undefined|null|\[|\]/);
  });

  it('always names Progineer Technologies as the company', () => {
    render(<CertificateSheet certificate={{ ...certificate, issuerName: 'Another Issuer Ltd' }} />);
    expect(detailLines()[1]).toBe('at Progineer Technologies');
  });

  it('shows the issuer\'s approved logo, keeping its aspect ratio', () => {
    render(<CertificateSheet certificate={certificate} />);
    const logo = within(sheet()).getByRole('img', { name: 'Progineer Technologies' });
    expect(logo.getAttribute('width')).toBe('1637');
    expect(logo.getAttribute('height')).toBe('720');
    expect(logo.getAttribute('src')).toMatch(/progineer-technologies-logo/);
    expect(logo.className).toBe('certificate-logo');
    // The supplied file is shown whole: nothing clipped.
    expect(logo.style.clipPath).toBe('');
  });

  it('shows another issuer by name, never with the Progineer logo', () => {
    render(<CertificateSheet certificate={{ ...certificate, issuerName: 'Another Issuer Ltd' }} />);
    expect(within(sheet()).queryByRole('img')).toBeNull();
    expect(screen.getByText('Another Issuer Ltd').className).toBe('certificate-issuer');
  });

  it('has blank HR and Mentor signature lines with the recorded names', () => {
    render(<CertificateSheet certificate={certificate} />);
    const hr = screen.getByTestId('signature-hr');
    const mentor = screen.getByTestId('signature-mentor');
    expect(hr.textContent).toBe('Hala ExampleHR Signature');
    expect(mentor.textContent).toBe('Omar ExampleMentor Signature');
    for (const area of [hr, mentor]) {
      expect(area.querySelector('.certificate-signature-line')?.textContent).toBe('');
      expect(area.querySelector('img, svg, canvas')).toBeNull();
    }
    expect(sheet().textContent).not.toMatch(/signed by|digitally signed/i);
  });

  it('prints no signatory name that was not recorded', () => {
    render(<CertificateSheet certificate={{ ...certificate, hrSignatoryName: null, mentorSignatoryName: null }} />);
    expect(screen.getByTestId('signature-hr').textContent).toBe('HR Signature');
    expect(screen.getByTestId('signature-mentor').textContent).toBe('Mentor Signature');
    expect(sheet().querySelector('.certificate-signature-name')).toBeNull();
    expect(sheet().textContent).not.toContain('@');
  });

  it('gives right-to-left names and titles their own direction', () => {
    render(<CertificateSheet certificate={{ ...certificate, recipientName: 'ليان أحمد المثال', trainingTitle: 'مطور واجهات أمامية', mentorSignatoryName: 'عمر المثال' }} />);
    expect(screen.getByText('ليان أحمد المثال').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('مطور واجهات أمامية').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('عمر المثال').getAttribute('dir')).toBe('auto');
    expect(sheet().getAttribute('dir')).toBe('ltr');
  });

  it('shows the completion date and no number or identifier', () => {
    render(<CertificateSheet certificate={certificate} />);
    expect(screen.getByText('11 March 2026').getAttribute('datetime')).toBe('2026-03-11');
    expect(sheet().textContent).not.toMatch(/number|No\.|#|\bid\b|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('puts the same sheet in the print-only copy', () => {
    render(<CertificatePrintCopy certificate={certificate} />);
    const copy = screen.getByTestId('certificate-print-copy');
    expect(copy.parentElement).toBe(document.body);
    expect(copy.textContent).toContain('Hala Example');
    expect(copy.textContent).toContain('who completed a 3-month internship as Frontend Developer');
    expect(copy.querySelector('img')?.getAttribute('alt')).toBe('Progineer Technologies');
    expect(copy.querySelector('button, a, nav')).toBeNull();
  });
});
