import { Application } from '../entities/application.entity.js';
import { ApplicationStatus } from '../enums/application-status.enum.js';
import { APPLICATION_CSV_HEADER, csvCell, toApplicationsCsv } from './applications-csv.js';

describe('applications CSV export', () => {
  it('contains only the approved fields, in order, with a BOM and CRLF rows', () => {
    const csv = toApplicationsCsv([
      new Application(
        '11111111-1111-4111-8111-111111111111',
        'Maya Odeh',
        'maya@example.com',
        'Engineering',
        new Date('2026-10-01T09:00:00Z'),
        new Date('2026-10-02T10:30:00Z'),
        ApplicationStatus.SHORTLISTED,
        true,
      ),
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(APPLICATION_CSV_HEADER.join(','));
    expect(lines[0]).toBe('Application ID,Applicant name,Email,Training,Status,Submitted at');
    expect(lines[1]).toBe(
      '11111111-1111-4111-8111-111111111111,Maya Odeh,maya@example.com,Engineering,SHORTLISTED,2026-10-02T10:30:00.000Z',
    );
    expect(lines[2]).toBe('');
    expect(csv).not.toContain('2026-10-01T09'); // upload time is not exported
  });

  it('writes an empty submission date for legacy rows', () => {
    const csv = toApplicationsCsv([
      new Application('id', 'A', 'a@x.com', 'T', new Date(), null, ApplicationStatus.NEW, false),
    ]);
    expect(csv.slice(1).split('\r\n')[1]).toBe('id,A,a@x.com,T,NEW,');
  });

  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('Odeh, Maya')).toBe('"Odeh, Maya"');
    expect(csvCell('The "Best"')).toBe('"The ""Best"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });

  it.each(['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'neutralizes spreadsheet formulas (%j)',
    (value) => {
      const cell = csvCell(value);
      expect(cell.startsWith('"\'')).toBe(true);
      expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    },
  );

  it('preserves meaningful leading/trailing spaces by quoting', () => {
    expect(csvCell(' padded ')).toBe('" padded "');
  });
});
