import { Application } from '../entities/application.entity.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { queryApplications, type ApplicationListQuery } from './application-list-query.js';

const app = (
  id: string,
  name: string,
  status: ApplicationStatus,
  submittedAt: string | null,
  training = 'Engineering',
  email = `${id}@example.com`,
) => new Application(id, name, email, training, new Date('2026-01-01T00:00:00Z'), submittedAt ? new Date(submittedAt) : null, status, true);

const applications = [
  app('a', 'Zara Khalil', ApplicationStatus.NEW, '2026-10-03T10:00:00Z'),
  app('b', 'adam Saleh', ApplicationStatus.REJECTED, '2026-10-01T10:00:00Z', 'Data Science'),
  app('c', 'Maya Odeh', ApplicationStatus.SELECTED, '2026-10-02T10:00:00Z'),
  app('d', 'Omar Nasser', ApplicationStatus.NEW, null, 'Design', 'omar@school.edu'),
];

const query = (overrides: Partial<ApplicationListQuery> = {}): ApplicationListQuery => ({
  sort: 'submittedAt',
  order: 'desc',
  ...overrides,
});

const ids = (result: Application[]) => result.map((application) => application.id);

describe('queryApplications', () => {
  it('sorts by actual submission time, newest first by default; missing times last', () => {
    expect(ids(queryApplications(applications, query()))).toEqual(['a', 'c', 'b', 'd']);
    expect(ids(queryApplications(applications, query({ order: 'asc' })))).toEqual(['d', 'b', 'c', 'a']);
  });

  it('sorts by applicant name case-insensitively', () => {
    expect(ids(queryApplications(applications, query({ sort: 'applicantName', order: 'asc' })))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('sorts by pipeline status order', () => {
    expect(ids(queryApplications(applications, query({ sort: 'status', order: 'asc' }))))
      .toEqual(['a', 'd', 'c', 'b']);
  });

  it('filters by status', () => {
    expect(ids(queryApplications(applications, query({ status: ApplicationStatus.NEW })))).toEqual(['a', 'd']);
  });

  it('searches name, email and training case-insensitively, ignoring surrounding spaces', () => {
    expect(ids(queryApplications(applications, query({ search: '  DATA ' })))).toEqual(['b']);
    expect(ids(queryApplications(applications, query({ search: 'school.edu' })))).toEqual(['d']);
    expect(ids(queryApplications(applications, query({ search: 'maya' })))).toEqual(['c']);
  });

  it('combines search, status filter and sorting', () => {
    expect(ids(queryApplications(applications, query({
      search: 'a',
      status: ApplicationStatus.NEW,
      sort: 'applicantName',
      order: 'asc',
    })))).toEqual(['d', 'a']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(queryApplications(applications, query({ search: 'nobody' }))).toEqual([]);
  });

  it('does not mutate its input', () => {
    const copy = [...applications];
    queryApplications(applications, query({ sort: 'applicantName', order: 'asc' }));
    expect(applications).toEqual(copy);
  });
});
