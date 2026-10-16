const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalizes an address the same way the database does (lower(btrim(...)))
// and rejects values that cannot receive a review link.
export function normalizeReviewEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();

  return EMAIL_SHAPE.test(email) && email.length <= 320
    ? email
    : null;
}
