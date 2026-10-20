import { describe, expect, it } from 'vitest';

import { EVALUATION_MAX_CODE_POINTS, contentProblem, countCodePoints, isBlank } from './content-rules';

describe('evaluation content rules', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(countCodePoints('😀')).toBe(1);
    expect(countCodePoints('تقييم')).toBe(5);
  });

  it('accepts exactly 40,000 code points and refuses one more (emoji count once)', () => {
    expect(contentProblem('😀'.repeat(EVALUATION_MAX_CODE_POINTS))).toBeNull();
    expect(contentProblem('a'.repeat(EVALUATION_MAX_CODE_POINTS + 1))).toBe('EVALUATION_CONTENT_TOO_LONG');
  });

  it('allows tab, LF and CR but refuses other control characters and lone surrogates', () => {
    expect(contentProblem('line\tone\r\nline two\n')).toBeNull();
    expect(contentProblem('a\u0000b')).toBe('EVALUATION_CONTENT_INVALID_CHARACTERS');
    expect(contentProblem('a\u0085b')).toBe('EVALUATION_CONTENT_INVALID_CHARACTERS');
    expect(contentProblem('a\ud800b')).toBe('EVALUATION_CONTENT_INVALID_CHARACTERS');
  });

  it('treats whitespace-only text as blank', () => {
    expect(isBlank(' \n\t')).toBe(true);
    expect(isBlank(' x ')).toBe(false);
  });
});
