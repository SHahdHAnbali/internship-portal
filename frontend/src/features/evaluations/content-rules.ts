// The same rules as the backend and the database: at most 40,000 Unicode code
// points, no control characters other than tab, LF and CR, no lone
// surrogates. Code points are counted by iterating the string ([...text]);
// String.length counts UTF-16 units and would count most emoji twice.
export const EVALUATION_MAX_CODE_POINTS = 40_000;

// The backend's global JSON request limit (Express default, 100 KiB). Text
// within the code-point limit can still exceed it when it uses many 3- or
// 4-byte characters.
export const REQUEST_BODY_LIMIT_BYTES = 100 * 1024;

export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

function isRefusedCodePoint(codePoint: number): boolean {
  return codePoint <= 0x08
    || codePoint === 0x0b
    || codePoint === 0x0c
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff);
}

export type ContentProblem = 'EVALUATION_CONTENT_INVALID_CHARACTERS' | 'EVALUATION_CONTENT_TOO_LONG';

export function contentProblem(text: string): ContentProblem | null {
  let count = 0;
  for (const character of text) {
    if (isRefusedCodePoint(character.codePointAt(0) as number)) return 'EVALUATION_CONTENT_INVALID_CHARACTERS';
    count += 1;
  }
  return count > EVALUATION_MAX_CODE_POINTS ? 'EVALUATION_CONTENT_TOO_LONG' : null;
}

export function isBlank(text: string): boolean {
  return text.trim() === '';
}
