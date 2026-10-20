import { countCodePoints, evaluationContentProblem, EVALUATION_CONTENT_MAX_CODE_POINTS } from './evaluation-content.js';

describe('evaluation content rules', () => {
  it('counts Unicode code points like PostgreSQL char_length, not UTF-16 units', () => {
    expect(countCodePoints('😀')).toBe(1);
    expect('😀'.length).toBe(2);
    expect(countCodePoints('سطر')).toBe(3);
    expect(countCodePoints('é')).toBe(2); // combining mark: two code points, one grapheme
    expect(countCodePoints('a\r\nb')).toBe(4);
    expect(countCodePoints('')).toBe(0);
  });

  it('accepts exactly 40,000 code points, including surrogate pairs and Arabic', () => {
    expect(EVALUATION_CONTENT_MAX_CODE_POINTS).toBe(40_000);
    expect(evaluationContentProblem('😀'.repeat(40_000))).toBeNull();
    expect(evaluationContentProblem('ب'.repeat(40_000))).toBeNull();
    expect(evaluationContentProblem('é'.repeat(20_000))).toBeNull();
  });

  it('refuses 40,001 code points even when string.length would be smaller or larger', () => {
    expect(evaluationContentProblem('😀'.repeat(40_001))).toBe('EVALUATION_CONTENT_TOO_LONG');
    expect(evaluationContentProblem('a'.repeat(40_001))).toBe('EVALUATION_CONTENT_TOO_LONG');
    expect(evaluationContentProblem('é'.repeat(20_000) + 'x')).toBe('EVALUATION_CONTENT_TOO_LONG');
  });

  it('allows tab, LF, CR and ordinary text, including leading and trailing spaces', () => {
    expect(evaluationContentProblem('  a\tb\r\nc\n  ')).toBeNull();
    expect(evaluationContentProblem('')).toBeNull();
  });

  it.each([
    ['NUL', '\u0000'], ['BEL', 'bell\u0007'], ['VT', '\u000B'], ['FF', '\u000C'], ['ESC', '\u001B'],
    ['DEL', '\u007F'], ['C1 NEL', 'nel\u0085'], ['C1 end', '\u009F'],
    ['lone high surrogate', 'x\uD83D'], ['lone low surrogate', '\uDE00x'],
  ])('refuses %s', (_label, text) => {
    expect(evaluationContentProblem(text)).toBe('EVALUATION_CONTENT_INVALID_CHARACTERS');
  });
});
