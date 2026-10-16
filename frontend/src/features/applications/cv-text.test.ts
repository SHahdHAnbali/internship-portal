import { describe, expect, it } from 'vitest';

import { cvItemText, cvTextList } from './cv-text';

describe('cv-text', () => {
  it('formats structured language entries as "language — proficiency"', () => {
    expect(cvTextList([
      { language: 'English', proficiency: 'Advanced' },
      { language: 'Arabic', proficiency: 'Native' },
      { language: 'French' },
      'German',
    ])).toEqual(['English — Advanced', 'Arabic — Native', 'French', 'German']);
  });

  it('keeps readable values of other structured entries', () => {
    expect(cvItemText({ name: 'AWS Cloud Practitioner', issuer: 'Amazon', year: 2025 }))
      .toBe('AWS Cloud Practitioner — Amazon, 2025');
    expect(cvItemText({ skill: 'TypeScript', level: 'Intermediate' })).toBe('TypeScript — Intermediate');
    expect(cvItemText({ unknown: 'Something' })).toBe('Something');
  });

  it('drops empty or malformed entries and non-array values', () => {
    expect(cvTextList(['  ', null, {}, [], { language: '  ' }, 42, ' SQL '])).toEqual(['42', 'SQL']);
    expect(cvTextList('English')).toEqual([]);
    expect(cvTextList(undefined)).toEqual([]);
  });
});
