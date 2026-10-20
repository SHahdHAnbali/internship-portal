import { Injectable, Logger } from '@nestjs/common';

import { SupabaseService } from '../../../../infrastructure/database/supabase.service.js';
import {
  certificateError,
  certificateErrorFromDatabase,
  knownCertificateErrorCode,
  type DatabaseErrorLike,
} from '../../domain/certificate-errors.js';
import {
  CertificateRepository,
  type CertificateDuration,
  type CertificateIssueKind,
  type CertificateStatus,
  type HrCertificateResponse,
  type InternCertificateResponse,
} from '../../domain/repositories/certificate.repository.js';

// Rows returned by list_my_certificates and get_my_certificate.
interface InternCertificateRecord {
  placement_id: string;
  certificate_title: string;
  issuer_name: string;
  recipient_name: string;
  training_title: string;
  completion_date: string;
  issued_at: string;
  duration_months: number | null;
  duration_days: number | null;
  hr_signatory_name: string | null;
  mentor_signatory_name: string | null;
}

// Rows returned by list_hr_placement_certificates and reissue_internship_certificate.
interface HrCertificateRecord extends InternCertificateRecord {
  certificate_id: string;
  status: CertificateStatus;
  issue_kind: CertificateIssueKind;
  issued_by_name: string | null;
  supersedes_certificate_id: string | null;
  reissue_reason: string | null;
  superseded_at: string | null;
  placement_start_date: string | null;
}

// Calls only the public certificate functions (never the internal
// internship_certificate_issue helper, and never the tables directly).
// Identity arguments always come from the verified session; every function
// re-checks role and ownership itself.
@Injectable()
export class SupabaseCertificateRepository implements CertificateRepository {
  private readonly logger = new Logger('CertificateRepository');

  constructor(private readonly supabase: SupabaseService) {}

  async listForIntern(authUserId: string): Promise<InternCertificateResponse[]> {
    return this.call('list_my_certificates', { p_auth_user_id: authUserId }, internMany);
  }

  async getForIntern(authUserId: string, placementId: string): Promise<InternCertificateResponse> {
    return this.call('get_my_certificate', {
      p_auth_user_id: authUserId,
      p_placement_id: placementId,
    }, (data) => single(internMany(data)));
  }

  async listForHrPlacement(hrProfileId: string, placementId: string): Promise<HrCertificateResponse[]> {
    return this.call('list_hr_placement_certificates', {
      p_actor_profile_id: hrProfileId,
      p_placement_id: placementId,
    }, hrMany);
  }

  async reissueForHr(hrProfileId: string, certificateId: string, reason: string): Promise<HrCertificateResponse> {
    return this.call('reissue_internship_certificate', {
      p_actor_profile_id: hrProfileId,
      p_certificate_id: certificateId,
      p_reason: reason,
    }, (data) => single(hrMany(data)));
  }

  // One RPC call per operation: no retries, no follow-up writes.
  private async call<T>(fn: string, args: Record<string, unknown>, parse: (data: unknown) => T): Promise<T> {
    const { data, error } = await this.supabase.client.rpc(fn, args);
    if (error) {
      // Expected conditions are answered normally. Anything else becomes a 500
      // and is logged with the function name and a sanitized error code only:
      // never arguments, names, titles, reasons, user ids or database text.
      if (!knownCertificateErrorCode(error)) {
        this.logger.error(`Certificate database call failed: function=${fn} code=${safeErrorCode(error)}`);
      }
      throw certificateErrorFromDatabase(error);
    }
    try {
      return parse(data);
    } catch (parseError) {
      this.logger.error(`Certificate database call returned an unexpected result: function=${fn}`);
      throw parseError;
    }
  }
}

// SQLSTATE (5 characters) or PostgREST code (e.g. PGRST202, missing function);
// anything else is reported as 'unknown'.
function safeErrorCode(error: DatabaseErrorLike): string {
  const code = error.code;
  return typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : 'unknown';
}

function single<T>(rows: T[]): T {
  if (rows.length !== 1) throw certificateError('CERTIFICATE_SERVER_ERROR');
  return rows[0];
}

// Fields are copied one by one, so nothing else the database might return
// (such as an internal id) can reach an intern.
function internMany(data: unknown): InternCertificateResponse[] {
  if (!Array.isArray(data) || !data.every(isInternCertificateRecord)) {
    throw certificateError('CERTIFICATE_SERVER_ERROR');
  }
  return data.map((row) => ({
    placementId: row.placement_id,
    certificateTitle: row.certificate_title,
    issuerName: row.issuer_name,
    recipientName: row.recipient_name,
    trainingTitle: row.training_title,
    duration: durationOf(row),
    completionDate: row.completion_date,
    hrSignatoryName: row.hr_signatory_name,
    mentorSignatoryName: row.mentor_signatory_name,
    issuedAt: row.issued_at,
  }));
}

function durationOf(row: InternCertificateRecord): CertificateDuration | null {
  return row.duration_months === null || row.duration_days === null
    ? null
    : { months: row.duration_months, days: row.duration_days };
}

function hrMany(data: unknown): HrCertificateResponse[] {
  if (!Array.isArray(data) || !data.every(isHrCertificateRecord)) {
    throw certificateError('CERTIFICATE_SERVER_ERROR');
  }
  return data.map((row) => ({
    id: row.certificate_id,
    placementId: row.placement_id,
    status: row.status,
    issueKind: row.issue_kind,
    certificateTitle: row.certificate_title,
    issuerName: row.issuer_name,
    recipientName: row.recipient_name,
    trainingTitle: row.training_title,
    completionDate: row.completion_date,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by_name,
    supersedesCertificateId: row.supersedes_certificate_id,
    reissueReason: row.reissue_reason,
    supersededAt: row.superseded_at,
    placementStartDate: row.placement_start_date,
    duration: durationOf(row),
    hrSignatoryName: row.hr_signatory_name,
    mentorSignatoryName: row.mentor_signatory_name,
  }));
}

const STATUSES = ['ISSUED', 'SUPERSEDED'];
const ISSUE_KINDS = ['COMPLETION', 'BACKFILL', 'REISSUE'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown) => typeof value === 'string' && value !== '';
const isNullableString = (value: unknown) => value === null || typeof value === 'string';
const isNullableName = (value: unknown) => value === null || isNonEmptyString(value);
const isCount = (value: unknown, max: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;

function isInternCertificateRecord(value: unknown): value is InternCertificateRecord {
  if (!isObject(value)) return false;
  // Duration: both parts or neither (unknown start, or completion before start).
  const duration = (value.duration_months === null && value.duration_days === null)
    || (isCount(value.duration_months, 1200) && isCount(value.duration_days, 31));
  return ['placement_id', 'certificate_title', 'issuer_name', 'recipient_name', 'training_title', 'issued_at']
    .every((key) => isNonEmptyString(value[key]))
    && typeof value.completion_date === 'string' && DATE_PATTERN.test(value.completion_date)
    && duration
    && isNullableName(value.hr_signatory_name)
    && isNullableName(value.mentor_signatory_name);
}

function isHrCertificateRecord(value: unknown): value is HrCertificateRecord {
  if (!isInternCertificateRecord(value)) return false;
  const row = value as unknown as Record<string, unknown>;
  if (!isNonEmptyString(row.certificate_id)) return false;
  if (!STATUSES.includes(String(row.status)) || !ISSUE_KINDS.includes(String(row.issue_kind))) return false;
  if (!isNullableString(row.issued_by_name) || !isNullableString(row.supersedes_certificate_id)) return false;
  if (!isNullableString(row.reissue_reason) || !isNullableString(row.superseded_at)) return false;
  if (row.placement_start_date !== null && !(typeof row.placement_start_date === 'string' && DATE_PATTERN.test(row.placement_start_date))) return false;
  // The table's checks: a reissue (only) names its predecessor and a reason;
  // superseded_at is set exactly for superseded records.
  const reissue = row.issue_kind === 'REISSUE';
  return reissue === (row.supersedes_certificate_id !== null)
    && reissue === (row.reissue_reason !== null)
    && (row.status === 'SUPERSEDED') === (row.superseded_at !== null);
}
