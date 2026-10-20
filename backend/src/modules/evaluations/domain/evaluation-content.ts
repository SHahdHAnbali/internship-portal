// Evaluation text rules, identical to the database (migration
// 20261018010000_mentor_evaluations.sql). The text is never trimmed,
// normalized or truncated; it is accepted exactly as sent or refused.

// PostgreSQL char_length(text) counts Unicode code points; so does iterating a
// JavaScript string ([...text].length). String.length counts UTF-16 units
// (an emoji outside the BMP counts 2) and must not be used for this limit.
export const EVALUATION_CONTENT_MAX_CODE_POINTS = 40_000;

export type EvaluationContentProblem =
  | 'EVALUATION_CONTENT_INVALID_CHARACTERS'
  | 'EVALUATION_CONTENT_TOO_LONG';

export function countCodePoints(text: string): number {
  let count = 0;
  for (const _codePoint of text) count += 1;
  return count;
}

// Control characters other than tab (0x09), LF (0x0A) and CR (0x0D): C0, DEL
// and C1, plus NUL, which PostgreSQL text cannot store. A lone UTF-16
// surrogate (iteration yields it as a single unit) is not a Unicode character
// and cannot be stored either.
function isRefusedCodePoint(codePoint: number): boolean {
  return codePoint <= 0x08
    || codePoint === 0x0b
    || codePoint === 0x0c
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff);
}

export function evaluationContentProblem(content: string): EvaluationContentProblem | null {
  let count = 0;
  for (const character of content) {
    if (isRefusedCodePoint(character.codePointAt(0) as number)) return 'EVALUATION_CONTENT_INVALID_CHARACTERS';
    count += 1;
  }
  return count > EVALUATION_CONTENT_MAX_CODE_POINTS ? 'EVALUATION_CONTENT_TOO_LONG' : null;
}
