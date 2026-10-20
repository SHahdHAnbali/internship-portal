import {
  CERTIFICATE_ERRORS,
  certificateError,
  certificateErrorFromDatabase,
  knownCertificateErrorCode,
} from './certificate-errors.js';

describe('certificate errors', () => {
  it.each([
    ['PZ403', 'hr_role_required', 403, 'CERTIFICATE_ACCESS_DENIED'],
    ['PZ403', 'intern_role_required', 403, 'CERTIFICATE_ACCESS_DENIED'],
    ['PZ404', 'placement_not_found', 404, 'PLACEMENT_NOT_FOUND'],
    ['PZ404', 'certificate_not_found', 404, 'CERTIFICATE_NOT_FOUND'],
    ['PZ409', 'placement_not_completed', 409, 'PLACEMENT_NOT_COMPLETED'],
    ['PZ409', 'certificate_not_current', 409, 'CERTIFICATE_NOT_CURRENT'],
    ['PZ409', 'certificate_source_incomplete', 409, 'CERTIFICATE_SOURCE_INCOMPLETE'],
    ['PZ400', 'reissue_reason_required', 400, 'REISSUE_REASON_REQUIRED'],
    ['PZ400', 'reissue_reason_too_long', 400, 'REISSUE_REASON_TOO_LONG'],
  ])('maps %s %s to %i %s', (sqlstate, message, status, code) => {
    const error = certificateErrorFromDatabase({ code: sqlstate, message });
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toEqual({
      statusCode: status,
      error: expect.any(String),
      code,
      message: CERTIFICATE_ERRORS[code as keyof typeof CERTIFICATE_ERRORS].message,
    });
  });

  it.each(['40P01', '40001', '23505'])('reports %s as a concurrent update (409)', (sqlstate) => {
    const error = certificateErrorFromDatabase({ code: sqlstate, message: 'duplicate key value violates unique constraint "x"' });
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'CERTIFICATE_CONCURRENT_UPDATE' });
  });

  it('trusts a message key only with the SQLSTATE the migration raises it with', () => {
    expect(knownCertificateErrorCode({ code: 'PZ404', message: 'hr_role_required' })).toBeUndefined();
    expect(knownCertificateErrorCode({ code: 'P0001', message: 'certificate_not_found' })).toBeUndefined();
    expect(knownCertificateErrorCode({ code: 'PZ403', message: 'toString' })).toBeUndefined();
    expect(knownCertificateErrorCode({ code: 'PZ403', message: null })).toBeUndefined();
  });

  it.each([
    { code: 'PZ409', message: 'certificate_immutable', details: 'only_supersede_allowed' },
    { code: '42501', message: 'permission denied for function list_my_certificates' },
    { code: 'PGRST202', message: 'Could not find the function public.list_my_certificates' },
    { code: undefined, message: undefined },
  ])('reports anything else as a generic 500 without database text', (dbError) => {
    const error = certificateErrorFromDatabase(dbError);
    expect(error.getStatus()).toBe(500);
    expect(error.getResponse()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'CERTIFICATE_SERVER_ERROR',
      message: 'The certificate request could not be completed.',
    });
    expect(JSON.stringify(error.getResponse())).not.toMatch(/immutable|permission|function|supersede/);
  });

  it('builds the project error body', () => {
    expect(certificateError('REISSUE_REASON_TOO_LONG').getResponse()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'REISSUE_REASON_TOO_LONG',
      message: 'The reason can be at most 1,000 characters.',
    });
  });
});
