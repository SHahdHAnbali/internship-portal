// The CV extraction model sometimes returns structured list entries such as
// { language: 'English', proficiency: 'Advanced' }. Stored CV lists are plain
// strings (the review DTO requires it), so entries are reduced to text such as
// "English — Advanced" instead of being dropped. Mirrors the frontend helper
// in frontend/src/features/applications/cv-text.ts.

const NAME_KEYS = ['language', 'name', 'skill', 'title', 'certification', 'label', 'value'];
const DETAIL_KEYS = ['proficiency', 'level', 'issuer', 'year', 'date'];

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function cvItemText(value: unknown): string | null {
  const scalar = scalarText(value);
  if (scalar !== null || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return scalar;
  }

  const record = value as Record<string, unknown>;
  const name = NAME_KEYS.map((key) => scalarText(record[key])).find((text) => text !== null) ?? null;
  const details = DETAIL_KEYS.map((key) => scalarText(record[key])).filter((text): text is string => text !== null);

  if (name) {
    return details.length ? `${name} — ${details.join(', ')}` : name;
  }

  const values = Object.values(record).map(scalarText).filter((text): text is string => text !== null);
  return values.length ? values.join(' — ') : null;
}

export function cvTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cvItemText).filter((text): text is string => text !== null);
}
