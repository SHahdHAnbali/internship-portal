import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ExtractedCvData } from '@/features/applications/types';

import ApplicantDataView from './ApplicantDataView';

// Stored shape of a legacy extraction (seen on a SELECTED → INTERN application):
// languages as objects instead of strings.
const legacy = {
  fullName: 'Maya Intern',
  email: 'maya@example.com',
  phone: null,
  location: 'Nablus',
  summary: 'Backend developer',
  education: [{ institution: 'An-Najah', degree: 'BSc', fieldOfStudy: 'Computer Engineering', startDate: '2022', endDate: null }],
  experience: [{ company: 'Acme', position: 'Intern', startDate: '2025', endDate: '2025', description: 'APIs' }],
  skills: ['TypeScript', { skill: 'SQL', level: 'Intermediate' }],
  languages: [{ language: 'English', proficiency: 'Advanced' }, { language: 'Arabic', proficiency: 'Native' }],
  certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'Amazon' }],
  links: { linkedin: null, github: null, portfolio: null },
} as unknown as ExtractedCvData;

describe('ApplicantDataView', () => {
  it('renders structured CV entries as text instead of crashing', () => {
    const html = renderToStaticMarkup(<ApplicantDataView data={legacy} />);
    expect(html).toContain('English — Advanced');
    expect(html).toContain('Arabic — Native');
    expect(html).toContain('SQL — Intermediate');
    expect(html).toContain('AWS Cloud Practitioner — Amazon');
    expect(html).toContain('Computer Engineering');
    expect(html).not.toContain('[object Object]');
  });

  it('tolerates missing or malformed list and entry fields', () => {
    const malformed = {
      ...legacy,
      languages: 'English',
      skills: null,
      education: [null, 'text', { institution: { name: 'X' }, degree: 'MSc' }],
      experience: undefined,
    } as unknown as ExtractedCvData;
    const html = renderToStaticMarkup(<ApplicantDataView data={malformed} />);
    expect(html).toContain('No languages listed.');
    expect(html).toContain('No skills listed.');
    expect(html).toContain('MSc');
    expect(html).toContain('No experience information.');
    expect(html).not.toContain('[object Object]');
  });
});
