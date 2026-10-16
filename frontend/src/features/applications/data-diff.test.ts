import { describe, expect, it } from 'vitest';

import { diffApplicantData } from './data-diff';
import type { ExtractedCvData } from './types';

const base: ExtractedCvData = {
  fullName: 'Maya', email: 'maya@example.com', phone: null, location: null, summary: null,
  education: [], experience: [], skills: [], languages: [], certifications: [],
  links: { linkedin: null, github: null, portfolio: null },
};

describe('diffApplicantData with structured language entries', () => {
  it('compares structured and string entries by their display text', () => {
    const original = { ...base, languages: [{ language: 'English', proficiency: 'Advanced' }] } as unknown as ExtractedCvData;
    const reviewed = { ...base, languages: ['English — Advanced', 'Arabic — Native'] };
    expect(diffApplicantData(original, reviewed)).toEqual([
      { field: 'languages', label: 'Languages', summary: 'Added Arabic — Native' },
    ]);
  });

  it('never reports "[object Object]"', () => {
    const original = { ...base, languages: [{ language: 'French', proficiency: 'Basic' }] } as unknown as ExtractedCvData;
    const summaries = diffApplicantData(original, base).map((change) => change.summary).join(' ');
    expect(summaries).toBe('Removed French — Basic');
    expect(summaries).not.toContain('[object Object]');
  });
});
