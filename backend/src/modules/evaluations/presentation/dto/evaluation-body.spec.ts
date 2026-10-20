import { HttpException } from '@nestjs/common';

import { parseCreateEvaluationBody, parsePublishEvaluationBody, parseSaveEvaluationBody } from './evaluation-body.js';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { code?: string }).code;
    throw error;
  }
  return undefined;
}

const KEY = '0f8e3b52-4a3c-4d7e-9b1a-2c3d4e5f6a7b';

describe('evaluation request bodies', () => {
  const text = '  Línea\r\nسطر 😀\t ';

  it('passes the text through exactly (no trim, no normalization)', () => {
    expect(parseCreateEvaluationBody({ content: text, clientRequestId: KEY })).toEqual({ content: text, clientRequestId: KEY });
    expect(parseSaveEvaluationBody({ content: text, expectedRevision: 3 })).toEqual({ content: text, expectedRevision: 3 });
    expect(parseSaveEvaluationBody({ content: '', expectedRevision: 1 }).content).toBe('');
    expect(parsePublishEvaluationBody({ expectedRevision: 7 })).toEqual({ expectedRevision: 7 });
  });

  it.each([
    [{ content: 'x', clientRequestId: KEY, mentorProfileId: 'someone' }],
    [{ content: 'x', clientRequestId: KEY, authorProfileId: 'someone' }],
    [{ content: 'x', clientRequestId: KEY, status: 'PUBLISHED' }],
    [{ content: 'x', clientRequestId: KEY, publishedContent: 'forged' }],
    [{ content: 'x', clientRequestId: KEY, role: 'HR' }],
  ])('refuses client-supplied identity or state on create: %j', (input) => {
    expect(codeOf(() => parseCreateEvaluationBody(input))).toBe('VALIDATION_FAILED');
  });

  it('refuses unknown fields on save and publish', () => {
    expect(codeOf(() => parseSaveEvaluationBody({ content: 'x', expectedRevision: 1, revision: 2 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => parsePublishEvaluationBody({ expectedRevision: 1, content: 'publish this instead' }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => parsePublishEvaluationBody({ expectedRevision: 1, publishedByProfileId: 'x' }))).toBe('VALIDATION_FAILED');
  });

  it.each([null, undefined, 'text', 42, [], ['content']])('refuses a non-object body %j', (input) => {
    expect(codeOf(() => parseCreateEvaluationBody(input))).toBe('VALIDATION_FAILED');
  });

  it.each([undefined, null, 5, { text: 'x' }])('refuses non-string content %j', (value) => {
    expect(codeOf(() => parseCreateEvaluationBody({ content: value, clientRequestId: KEY }))).toBe('VALIDATION_FAILED');
  });

  it.each([undefined, null, '', 'not-a-uuid', 42, `${KEY}x`, ` ${KEY}`])('refuses a create without a valid client request id (%j)', (value) => {
    expect(codeOf(() => parseCreateEvaluationBody({ content: 'x', clientRequestId: value }))).toBe('VALIDATION_FAILED');
  });

  it('normalizes the client request id to lower case (the same operation keeps the same key)', () => {
    expect(parseCreateEvaluationBody({ content: 'x', clientRequestId: KEY.toUpperCase() }).clientRequestId).toBe(KEY);
  });

  it.each([undefined, null, 0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('refuses expectedRevision %j', (value) => {
    expect(codeOf(() => parseSaveEvaluationBody({ content: 'x', expectedRevision: value }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => parsePublishEvaluationBody({ expectedRevision: value }))).toBe('VALIDATION_FAILED');
  });

  it('applies the content limits with stable codes', () => {
    expect(codeOf(() => parseCreateEvaluationBody({ content: '😀'.repeat(40_001), clientRequestId: KEY }))).toBe('EVALUATION_CONTENT_TOO_LONG');
    expect(codeOf(() => parseSaveEvaluationBody({ content: 'bell\u0007', expectedRevision: 1 }))).toBe('EVALUATION_CONTENT_INVALID_CHARACTERS');
    expect(parseCreateEvaluationBody({ content: '😀'.repeat(40_000), clientRequestId: KEY }).content).toHaveLength(80_000);
  });
});
