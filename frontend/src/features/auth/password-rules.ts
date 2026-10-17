// Owner-approved minimum (2026-10-17): length only, no composition rules.
// Supabase Auth also applies the project's own password policy on save.
export const PASSWORD_MIN_LENGTH = 12;
// Supabase Auth refuses passwords longer than 72 characters.
export const PASSWORD_MAX_LENGTH = 72;

export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (password !== confirmation) {
    return 'The two passwords do not match.';
  }
  return null;
}
