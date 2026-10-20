// Certificates of completion (database functions in
// supabase/migrations/20261019000000_internship_certificates.sql and
// 20261020000000_certificate_details.sql).
//
// There is no certificate number. The intern's view is keyed by placement and
// carries no internal record id, status, reason or history; HR's view carries
// the record id (needed to reissue) and the reissue history.

export type CertificateStatus = 'ISSUED' | 'SUPERSEDED';
export type CertificateIssueKind = 'COMPLETION' | 'BACKFILL' | 'REISSUE';

// Actual duration, from the placement's start date to its completion date
// (completion day included), computed by the database from the copies
// stored on the certificate.
export interface CertificateDuration {
  months: number;
  days: number;
}

// The intern's own current certificate. Every detail is the copy taken when
// it was issued; null means it could not be established (never guessed).
export interface InternCertificateResponse {
  placementId: string;
  certificateTitle: string;
  // The issuing organization, also the company shown (Progineer Technologies).
  issuerName: string;
  recipientName: string;
  // The internship's title when issued: the training stated on the certificate.
  trainingTitle: string;
  duration: CertificateDuration | null;
  // Calendar date (YYYY-MM-DD) of the official completion in Asia/Hebron.
  completionDate: string;
  // The HR user who completed the placement, and the placement's Mentor.
  hrSignatoryName: string | null;
  mentorSignatoryName: string | null;
  issuedAt: string;
}

// One record of a placement's certificate history, for HR.
export interface HrCertificateResponse {
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
  // Null for a backfilled certificate whose completion had no recorded HR actor.
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

export abstract class CertificateRepository {
  abstract listForIntern(authUserId: string): Promise<InternCertificateResponse[]>;

  abstract getForIntern(authUserId: string, placementId: string): Promise<InternCertificateResponse>;

  abstract listForHrPlacement(hrProfileId: string, placementId: string): Promise<HrCertificateResponse[]>;

  // Supersedes the current record and returns the new one (never retried).
  abstract reissueForHr(hrProfileId: string, certificateId: string, reason: string): Promise<HrCertificateResponse>;
}
