import type { Application } from '../entities/application.entity.js';

// Approved HR export fields only (2026-10-11): application id, applicant name,
// email, training, status, submission date. Never CV data, CV links or phone.
export const APPLICATION_CSV_HEADER = [
  'Application ID',
  'Applicant name',
  'Email',
  'Training',
  'Status',
  'Submitted at',
] as const;

export function toApplicationsCsv(applications: readonly Application[]): string {
  const rows = applications.map((application) => [
    application.id,
    application.applicantName,
    application.applicantEmail,
    application.internshipTitle,
    application.status,
    application.submittedAt ? application.submittedAt.toISOString() : '',
  ]);

  // CRLF line endings and a UTF-8 BOM so spreadsheet apps read names correctly.
  return '﻿' + [APPLICATION_CSV_HEADER, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n') + '\r\n';
}

// RFC 4180 quoting plus formula-injection protection: a value that a
// spreadsheet would evaluate (= + - @, tab, CR) is prefixed with a quote.
export function csvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralized) || neutralized !== value || /^\s|\s$/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized;
}
