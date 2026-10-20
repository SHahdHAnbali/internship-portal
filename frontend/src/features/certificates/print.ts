import type { CertificateContent } from './CertificateDocument';

// Restores the page title after printing; one at a time, so a second print
// before the first afterprint never takes the certificate title as original.
let pendingRestore: (() => void) | null = null;

// Opens the browser's print dialog (where "Save as PDF" is a destination).
// The page title becomes the suggested PDF file name while printing.
export function printCertificate(certificate: CertificateContent) {
  if (!pendingRestore) {
    const previousTitle = document.title;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
      pendingRestore = null;
    };
    pendingRestore = restore;
    window.addEventListener('afterprint', restore);
  }
  document.title = `${certificate.certificateTitle} - ${certificate.recipientName}`;
  window.print();
}
