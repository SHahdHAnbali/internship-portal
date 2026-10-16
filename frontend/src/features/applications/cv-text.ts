// CV list entries (skills, languages, certifications) are strings, but some
// stored extractions hold structured entries such as
// { language: 'English', proficiency: 'Advanced' }. These helpers turn any
// entry into display text so nothing is rendered as an object or dropped
// silently, and nothing is shown as "[object Object]".

// Keys that name the entry, in order of preference, and keys that qualify it.
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

// One entry as text, e.g. "English — Advanced"; null when nothing usable.
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

  // Unknown shape: keep whatever readable values it has.
  const values = Object.values(record).map(scalarText).filter((text): text is string => text !== null);
  return values.length ? values.join(' — ') : null;
}

// A list field as display strings; anything that is not an array is empty.
export function cvTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cvItemText).filter((text): text is string => text !== null);
}
