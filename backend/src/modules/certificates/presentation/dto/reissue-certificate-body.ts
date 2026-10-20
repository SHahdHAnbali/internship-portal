import type { PipeTransform } from '@nestjs/common';

import { certificateError, REISSUE_REASON_MAX_LENGTH } from '../../domain/certificate-errors.js';

// Parsed strictly here instead of by the global ValidationPipe, which would
// silently drop unknown fields: any field other than `reason` (for example an
// actor, role, placement, status or certificate data) is refused with 400
// VALIDATION_FAILED. The HR user always comes from the verified session.

export interface ReissueCertificateBody {
  // Trimmed; the database trims and checks it again.
  reason: string;
}

export function parseReissueCertificateBody(body: unknown): ReissueCertificateBody {
  // A request without a body has no reason.
  if (body === undefined) {
    throw certificateError('REISSUE_REASON_REQUIRED');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw certificateError('VALIDATION_FAILED');
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'reason')) {
    throw certificateError('VALIDATION_FAILED');
  }
  if (record.reason === undefined || record.reason === null) {
    throw certificateError('REISSUE_REASON_REQUIRED');
  }
  if (typeof record.reason !== 'string') {
    throw certificateError('VALIDATION_FAILED');
  }
  const reason = record.reason.trim();
  if (reason === '') {
    throw certificateError('REISSUE_REASON_REQUIRED');
  }
  // Characters as PostgreSQL's char_length counts them: iterating a string
  // yields code points (String.length counts UTF-16 units). NUL and lone
  // surrogates cannot be stored in PostgreSQL text.
  let length = 0;
  for (const character of reason) {
    const codePoint = character.codePointAt(0) as number;
    if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw certificateError('VALIDATION_FAILED');
    }
    length += 1;
  }
  if (length > REISSUE_REASON_MAX_LENGTH) {
    throw certificateError('REISSUE_REASON_TOO_LONG');
  }
  return { reason };
}

export class ReissueCertificateBodyPipe implements PipeTransform<unknown, ReissueCertificateBody> {
  transform(value: unknown): ReissueCertificateBody {
    return parseReissueCertificateBody(value);
  }
}
