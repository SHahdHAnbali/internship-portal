import { HttpException } from '@nestjs/common';

import { parseReissueCertificateBody, ReissueCertificateBodyPipe } from './reissue-certificate-body.js';

function codeOf(body: unknown): string | undefined {
  try {
    parseReissueCertificateBody(body);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    return ((error as HttpException).getResponse() as { code: string }).code;
  }
}

describe('reissue certificate body', () => {
  it('accepts a reason and trims it', () => {
    expect(parseReissueCertificateBody({ reason: '  Name corrected  ' })).toEqual({ reason: 'Name corrected' });
    expect(new ReissueCertificateBodyPipe().transform({ reason: 'Fix' })).toEqual({ reason: 'Fix' });
  });

  it.each([
    [undefined],
    [{}],
    [{ reason: null }],
    [{ reason: '' }],
    [{ reason: '   ' }],
    [{ reason: '\n\t ' }],
  ])('requires a non-blank reason: %j', (body) => {
    expect(codeOf(body)).toBe('REISSUE_REASON_REQUIRED');
  });

  it('allows 1000 characters (counted like PostgreSQL) and refuses 1001', () => {
    expect(parseReissueCertificateBody({ reason: 'x'.repeat(1000) }).reason).toHaveLength(1000);
    expect(parseReissueCertificateBody({ reason: `  ${'x'.repeat(1000)}  ` }).reason).toHaveLength(1000);
    // 1000 emoji are 2000 UTF-16 units but 1000 characters.
    expect(parseReissueCertificateBody({ reason: '😀'.repeat(1000) }).reason).toHaveLength(2000);
    expect(codeOf({ reason: 'x'.repeat(1001) })).toBe('REISSUE_REASON_TOO_LONG');
    expect(codeOf({ reason: '😀'.repeat(1001) })).toBe('REISSUE_REASON_TOO_LONG');
  });

  it.each([
    [null],
    ['Fix'],
    [['Fix']],
    [{ reason: 42 }],
    [{ reason: ['Fix'] }],
    [{ reason: 'Fix\u0000' }],
    [{ reason: 'Fix \ud800' }],
    // No actor, role or certificate data from the client.
    [{ reason: 'Fix', actorProfileId: '11111111-1111-4111-8111-111111111111' }],
    [{ reason: 'Fix', role: 'HR' }],
    [{ reason: 'Fix', recipientName: 'Someone Else' }],
    [{ reason: 'Fix', certificateNumber: 'C-1' }],
  ])('refuses anything else: %j', (body) => {
    expect(codeOf(body)).toBe('VALIDATION_FAILED');
  });
});
