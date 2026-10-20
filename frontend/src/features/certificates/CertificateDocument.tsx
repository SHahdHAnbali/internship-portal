import type { HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import './certificate.css';

import { issuerBrand, logoClipPath } from './brand';
import { ISSUING_COMPANY_NAME } from './constants';
import {
  DETAILS_FIT_LIMITS,
  NAME_FIT_LIMITS,
  SIGNATORY_FIT_LIMITS,
  fitSize,
  formatCompletionDate,
  formatDuration,
  indefiniteArticle,
} from './messages';
import type { InternCertificate } from './types';

// The printable fields of the current certificate (the copies stored when it
// was issued): never an id, number, status or reason.
export type CertificateContent = Pick<
  InternCertificate,
  | 'certificateTitle'
  | 'issuerName'
  | 'recipientName'
  | 'trainingTitle'
  | 'duration'
  | 'completionDate'
  | 'hrSignatoryName'
  | 'mentorSignatoryName'
>;

const present = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

// The certificate itself, laid out for A4 landscape:
//
//   Certificate of Completion
//   This certificate is proudly presented to
//   [Intern's Full Name]
//   who completed a [Duration] internship as [Training title]
//   at Progineer Technologies
//
// The training title is the internship's title copied when the certificate
// was issued; it is always stated. A title that already names the internship
// ("React Developer Internship") reads "who completed the 3-month React
// Developer Internship". An unknown duration (legacy certificates) is left
// out, never replaced by a placeholder. Names and the title take their own
// direction (dir="auto").
export function CertificateSheet({
  certificate,
  ...rest
}: { certificate: CertificateContent } & HTMLAttributes<HTMLElement>) {
  const brand = issuerBrand(certificate.issuerName);
  const duration = certificate.duration ? formatDuration(certificate.duration) : null;
  const title = <strong dir="auto">{certificate.trainingTitle}</strong>;
  const detailsText = `${duration ?? ''} ${certificate.trainingTitle} ${ISSUING_COMPANY_NAME}`;

  return (
    <article className="certificate-sheet" lang="en" dir="ltr" {...rest}>
      <div className="certificate-frame">
        <header className="certificate-header">
          {brand ? (
            <img
              className="certificate-logo"
              src={brand.logoSrc}
              width={brand.width}
              height={brand.height}
              alt={certificate.issuerName}
              style={{ clipPath: logoClipPath(brand) }}
            />
          ) : (
            <p className="certificate-issuer">{certificate.issuerName}</p>
          )}
          <h2 className="certificate-title">{certificate.certificateTitle}</h2>
          <div className="certificate-rule" aria-hidden="true" />
        </header>

        <div className="certificate-body">
          <p className="certificate-lead">This certificate is proudly presented to</p>
          <p className="certificate-recipient" dir="auto" data-fit={fitSize(certificate.recipientName, NAME_FIT_LIMITS)}>
            {certificate.recipientName}
          </p>
          <div className="certificate-details" data-fit={fitSize(detailsText, DETAILS_FIT_LIMITS)} data-testid="certificate-internship-details">
            <p>
              {namesTheInternship(certificate.trainingTitle) ? (
                duration
                  ? <>who completed the <strong>{duration}</strong> {title}</>
                  : <>who completed the {title}</>
              ) : duration ? (
                <>who completed {indefiniteArticle(duration)} <strong>{duration}</strong> internship as {title}</>
              ) : (
                <>who completed an internship as {title}</>
              )}
            </p>
            <p>at <strong>{ISSUING_COMPANY_NAME}</strong></p>
          </div>
        </div>

        <footer className="certificate-footer">
          <SignatureArea role="hr" label="HR Signature" name={certificate.hrSignatoryName} />
          <div className="certificate-date-block">
            <p className="certificate-date-label">Date of completion</p>
            <p className="certificate-date">
              <time dateTime={certificate.completionDate}>{formatCompletionDate(certificate.completionDate)}</time>
            </p>
          </div>
          <SignatureArea role="mentor" label="Mentor Signature" name={certificate.mentorSignatoryName} />
        </footer>
      </div>
    </article>
  );
}

// "React Developer Internship", "Summer internship": the title already says it.
function namesTheInternship(title: string): boolean {
  return /\binternship\s*$/i.test(title.trim());
}

// An empty line to sign by hand: no signature image and nothing suggesting it
// has been signed. The printed name appears only when it was recorded.
function SignatureArea({ role, label, name }: { role: string; label: string; name: string | null | undefined }) {
  return (
    <div className="certificate-signature" data-testid={`signature-${role}`}>
      <div className="certificate-signature-line" aria-hidden="true" />
      {present(name) && (
        <p className="certificate-signature-name" dir="auto" data-fit={fitSize(name, SIGNATORY_FIT_LIMITS)}>{name}</p>
      )}
      <p className="certificate-signature-label">{label}</p>
    </div>
  );
}

// A second copy of the sheet directly under <body>, shown only when printing
// (see certificate.css): the printout then contains the certificate alone,
// on one A4 page, without the portal's navigation, buttons or dialogs.
export function CertificatePrintCopy({ certificate }: { certificate: CertificateContent }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="certificate-print-portal" aria-hidden="true" data-testid="certificate-print-copy">
      <CertificateSheet certificate={certificate} />
    </div>,
    document.body,
  );
}
