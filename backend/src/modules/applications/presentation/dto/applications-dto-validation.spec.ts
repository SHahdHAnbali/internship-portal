import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SubmitReviewedApplicationDto } from './submit-reviewed-application.dto.js';
import { UpdateApplicationStatusDto } from './update-application-status.dto.js';
import { ListApplicationsQueryDto } from './list-applications-query.dto.js';
import { UpdateApplicantProfileDto } from './update-applicant-profile.dto.js';
import { CheckCvDuplicateDto } from './check-cv-duplicate.dto.js';

const options = { whitelist: true };

async function check<T extends object>(cls: new () => T, plain: unknown) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, options);
  return { instance, errors: errors.map((error) => error.property) };
}

const reviewed = {
  fullName: 'Maya Odeh',
  email: 'maya@example.com',
  phone: null,
  location: null,
  summary: null,
  education: [{ institution: 'An-Najah', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2020', endDate: '2024' }],
  experience: [{ company: 'Acme', position: 'Intern', startDate: null, endDate: null, description: 'Built things' }],
  skills: ['SQL'],
  languages: ['Arabic'],
  certifications: [],
  links: { linkedin: null, github: 'https://github.com/maya', portfolio: null },
};

describe('SubmitReviewedApplicationDto', () => {
  it('accepts a complete reviewed payload', async () => {
    expect((await check(SubmitReviewedApplicationDto, reviewed)).errors).toEqual([]);
  });

  it('strips unknown fields, including inside nested entries', async () => {
    const { instance, errors } = await check(SubmitReviewedApplicationDto, {
      ...reviewed,
      role: 'HR',
      education: [{ ...reviewed.education[0], admin: true }],
      links: { ...reviewed.links, evil: 'x' },
    });
    expect(errors).toEqual([]);
    expect(instance).not.toHaveProperty('role');
    expect(instance.education[0]).not.toHaveProperty('admin');
    expect(instance.links).not.toHaveProperty('evil');
  });

  it.each([
    ['blank name', { fullName: '' }, 'fullName'],
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['non-string skill', { skills: [1] }, 'skills'],
    ['too many skills', { skills: Array.from({ length: 101 }, (_, i) => `s${i}`) }, 'skills'],
    ['education not a list', { education: 'BSc' }, 'education'],
    ['overlong experience description', { experience: [{ description: 'x'.repeat(3001) }] }, 'experience'],
    ['links not an object', { links: 'github' }, 'links'],
    ['overlong summary', { summary: 'x'.repeat(3001) }, 'summary'],
  ])('rejects %s', async (_label, override, property) => {
    expect((await check(SubmitReviewedApplicationDto, { ...reviewed, ...override })).errors).toContain(property);
  });
});

describe('UpdateApplicantProfileDto', () => {
  it('has no email or role field to edit', async () => {
    const { instance, errors } = await check(UpdateApplicantProfileDto, {
      ...reviewed,
      fullName: '  Maya  ',
      email: 'other@example.com',
      role: 'HR',
    });
    expect(errors).toEqual([]);
    expect(instance.fullName).toBe('Maya');
    expect(instance).not.toHaveProperty('email');
    expect(instance).not.toHaveProperty('role');
  });
});

describe('UpdateApplicationStatusDto', () => {
  it.each(['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'])('accepts %s', async (status) => {
    expect((await check(UpdateApplicationStatusDto, { status })).errors).toEqual([]);
  });

  it.each(['NEW', 'DRAFT', 'APPROVED', ''])('rejects %j as a target status', async (status) => {
    expect((await check(UpdateApplicationStatusDto, { status })).errors).toContain('status');
  });

  it('trims reason and note and turns blanks into null', async () => {
    const { instance } = await check(UpdateApplicationStatusDto, { status: 'REJECTED', reason: '  Missing skills ', note: '   ' });
    expect(instance.reason).toBe('Missing skills');
    expect(instance.note).toBeNull();
  });

  it('limits reason and note length', async () => {
    expect((await check(UpdateApplicationStatusDto, { status: 'REJECTED', reason: 'x'.repeat(1001) })).errors).toContain('reason');
    expect((await check(UpdateApplicationStatusDto, { status: 'SELECTED', note: 'x'.repeat(2001) })).errors).toContain('note');
  });
});

describe('ListApplicationsQueryDto', () => {
  it('accepts known filters and ignores empty values', async () => {
    const { instance, errors } = await check(ListApplicationsQueryDto, { status: 'NEW', search: ' maya ', sort: 'applicantName', order: 'asc' });
    expect(errors).toEqual([]);
    expect(instance.search).toBe('maya');
    expect((await check(ListApplicationsQueryDto, { status: '', search: '' })).errors).toEqual([]);
  });

  it.each([
    ['DRAFT status', { status: 'DRAFT' }, 'status'],
    ['unknown sort', { sort: 'cvPath' }, 'sort'],
    ['bad order', { order: 'sideways' }, 'order'],
    ['overlong search', { search: 'x'.repeat(201) }, 'search'],
  ])('rejects %s', async (_label, query, property) => {
    expect((await check(ListApplicationsQueryDto, query)).errors).toContain(property);
  });
});

describe('CheckCvDuplicateDto', () => {
  const hash = 'a'.repeat(64);

  it('accepts a SHA-256 with one training target', async () => {
    expect((await check(CheckCvDuplicateDto, { cvSha256: hash, internshipId: '11111111-1111-4111-8111-111111111111' })).errors).toEqual([]);
    expect((await check(CheckCvDuplicateDto, { cvSha256: hash.toUpperCase(), requestedTraining: 'Robotics' })).errors).toEqual([]);
  });

  it.each([
    [{}, 'cvSha256'],
    [{ cvSha256: 'a'.repeat(63) }, 'cvSha256'],
    [{ cvSha256: 'g'.repeat(64) }, 'cvSha256'],
    [{ cvSha256: hash, internshipId: 'not-a-uuid' }, 'internshipId'],
    [{ cvSha256: hash, requestedTraining: 'x'.repeat(151) }, 'requestedTraining'],
  ])('refuses %j', async (plain, property) => {
    expect((await check(CheckCvDuplicateDto, plain)).errors).toContain(property);
  });

  it('drops unknown fields (no file or identity data is accepted)', async () => {
    const { instance, errors } = await check(CheckCvDuplicateDto, { cvSha256: hash, requestedTraining: 'Robotics', email: 'x@example.com' });
    expect(errors).toEqual([]);
    expect(instance).not.toHaveProperty('email');
  });
});
