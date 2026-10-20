// Certificates of completion, exactly as returned by the backend
// (backend/src/modules/certificates/domain/repositories/certificate.repository.ts).
// A certificate has no number.

export type CertificateStatus = 'ISSUED' | 'SUPERSEDED';
export type CertificateIssueKind = 'COMPLETION' | 'BACKFILL' | 'REISSUE';

// Actual duration from the placement's start date to its completion date
// (completion day included), computed by the server from the stored copies.
export interface CertificateDuration {
  months: number;
  days: number;
}

// The intern's own current certificate (GET /intern/me/certificates[/:placementId]).
// Addressed by its placement: the intern never receives an internal record id,
// status, reissue reason or history.
export interface InternCertificate {
  placementId: string;
  certificateTitle: string;
  issuerName: string;
  recipientName: string;
  // The internship's title when issued: the training stated on the certificate.
  trainingTitle: string;
  // Copies taken when issued; null = could not be established (never guessed).
  duration: CertificateDuration | null;
  // Calendar date (YYYY-MM-DD) of the official completion, in Asia/Hebron.
  completionDate: string;
  // The HR user who completed the placement, and the placement's Mentor.
  hrSignatoryName: string | null;
  mentorSignatoryName: string | null;
  issuedAt: string;
}

// One record of a placement's certificate history, for HR only
// (GET /hr/placements/:placementId/certificates, POST /hr/certificates/:id/reissue).
export interface HrCertificate {
  id: string;
  placementId: string;
  status: CertificateStatus;
  issueKind: CertificateIssueKind;
  certificateTitle: string;
  issuerName: string;
  recipientName: string;
  trainingTitle: string;
  completionDate: string;
  issuedAt: string;
  // Null for a backfilled certificate whose completion had no recorded HR user.
  issuedByName: string | null;
  supersedesCertificateId: string | null;
  reissueReason: string | null;
  supersededAt: string | null;
  // The placement's actual start date (YYYY-MM-DD) as copied.
  placementStartDate: string | null;
  duration: CertificateDuration | null;
  hrSignatoryName: string | null;
  mentorSignatoryName: string | null;
}
