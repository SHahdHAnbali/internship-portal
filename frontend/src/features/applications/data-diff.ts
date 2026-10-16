import { cvItemText, cvTextList } from './cv-text';
import type { ExtractedCvData } from './types';

export interface FieldChange {
  field: string;
  label: string;
  // Human-readable description of what the applicant changed.
  summary: string;
}

const TEXT_FIELDS: Array<[keyof ExtractedCvData, string]> = [
  ['fullName', 'Full name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['location', 'Location'],
  ['summary', 'Professional summary'],
];

const LIST_FIELDS: Array<[keyof ExtractedCvData, string]> = [
  ['skills', 'Skills'],
  ['languages', 'Languages'],
  ['certifications', 'Certifications'],
];

const norm = (value: unknown) => cvItemText(value) ?? '';

// Lists what the applicant changed between the original AI extraction and the
// reviewed submission. Purely informational for HR.
export function diffApplicantData(
  original: ExtractedCvData,
  reviewed: ExtractedCvData,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, label] of TEXT_FIELDS) {
    const before = norm(original[field]);
    const after = norm(reviewed[field]);
    if (before !== after) {
      changes.push({
        field,
        label,
        summary: !before ? 'Added' : !after ? 'Removed' : 'Edited',
      });
    }
  }

  for (const [field, label] of LIST_FIELDS) {
    const before = new Set(cvTextList(original[field]));
    const after = new Set(cvTextList(reviewed[field]));
    const added = [...after].filter((item) => !before.has(item));
    const removed = [...before].filter((item) => !after.has(item));
    if (added.length || removed.length) {
      const parts = [];
      if (added.length) parts.push(`added ${added.join(', ')}`);
      if (removed.length) parts.push(`removed ${removed.join(', ')}`);
      changes.push({ field, label, summary: capitalize(parts.join('; ')) });
    }
  }

  for (const [field, label] of [['education', 'Education'], ['experience', 'Experience']] as const) {
    const before = original[field] ?? [];
    const after = reviewed[field] ?? [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({
        field,
        label,
        summary: before.length === after.length
          ? 'Entries edited'
          : `${before.length} → ${after.length} entries`,
      });
    }
  }

  for (const key of ['linkedin', 'github', 'portfolio'] as const) {
    if (norm(original.links?.[key]) !== norm(reviewed.links?.[key])) {
      changes.push({ field: `links.${key}`, label: `${key[0].toUpperCase()}${key.slice(1)} link`, summary: 'Edited' });
    }
  }

  return changes;
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
