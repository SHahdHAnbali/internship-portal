import { evaluationErrorFromDatabase } from './evaluation-errors.js';

function body(error: Parameters<typeof evaluationErrorFromDatabase>[0]) {
  const exception = evaluationErrorFromDatabase(error);
  return { status: exception.getStatus(), response: exception.getResponse() as Record<string, unknown> };
}

describe('evaluation database error mapping', () => {
  it.each([
    ['PZE01', 'evaluation_access_denied', 403, 'EVALUATION_ACCESS_DENIED'],
    ['PZE02', 'placement_not_found', 404, 'PLACEMENT_NOT_FOUND'],
    ['PZE03', 'evaluation_not_found', 404, 'EVALUATION_NOT_FOUND'],
    ['PZE04', 'placement_not_active', 409, 'PLACEMENT_NOT_ACTIVE'],
    ['PZE05', 'evaluation_revision_conflict', 409, 'EVALUATION_REVISION_CONFLICT'],
    ['PZE06', 'evaluation_nothing_to_publish', 409, 'EVALUATION_NOTHING_TO_PUBLISH'],
    ['PZE07', 'evaluation_content_too_long', 400, 'EVALUATION_CONTENT_TOO_LONG'],
    ['PZE08', 'evaluation_content_invalid_characters', 400, 'EVALUATION_CONTENT_INVALID_CHARACTERS'],
    ['PZE09', 'evaluation_content_required', 400, 'EVALUATION_CONTENT_REQUIRED'],
    ['PZE10', 'evaluation_integrity_violation', 500, 'EVALUATION_SERVER_ERROR'],
    ['PZE11', 'evaluation_create_key_reused', 409, 'EVALUATION_CREATE_KEY_REUSED'],
    ['PZE12', 'evaluation_client_request_required', 400, 'VALIDATION_FAILED'],
  ])('maps %s (%s) to %i %s', (code, message, status, apiCode) => {
    const result = body({ code, message, details: null });
    expect(result.status).toBe(status);
    expect(result.response).toMatchObject({ statusCode: status, code: apiCode });
    expect(typeof result.response.message).toBe('string');
  });

  it('keeps PLACEMENT_NOT_ACTIVE and EVALUATION_REVISION_CONFLICT distinct (both 409)', () => {
    expect(body({ code: 'PZE04', message: 'placement_not_active' }).response.code).toBe('PLACEMENT_NOT_ACTIVE');
    expect(body({ code: 'PZE05', message: 'evaluation_revision_conflict' }).response.code).toBe('EVALUATION_REVISION_CONFLICT');
  });

  it('uses the SQLSTATE before the message key', () => {
    expect(body({ code: 'PZE03', message: 'placement_not_active' }).response.code).toBe('EVALUATION_NOT_FOUND');
  });

  it('falls back to the message key only when the SQLSTATE is unknown or missing', () => {
    expect(body({ code: undefined, message: 'evaluation_not_found' }).response.code).toBe('EVALUATION_NOT_FOUND');
    expect(body({ code: 'XX000', message: 'placement_not_active' }).response.code).toBe('PLACEMENT_NOT_ACTIVE');
  });

  it('adds currentRevision from the conflict detail when it is valid', () => {
    expect(body({ code: 'PZE05', message: 'evaluation_revision_conflict', details: '{"currentRevision" : 8}' }).response)
      .toMatchObject({ code: 'EVALUATION_REVISION_CONFLICT', currentRevision: 8 });
  });

  it.each([null, undefined, '', 'not json', '{"currentRevision":"8"}', '{"currentRevision":0}', '{"currentRevision":1.5}', '[8]'])(
    'omits currentRevision for detail %j', (details) => {
      const response = body({ code: 'PZE05', message: 'evaluation_revision_conflict', details }).response;
      expect(response.code).toBe('EVALUATION_REVISION_CONFLICT');
      expect(response).not.toHaveProperty('currentRevision');
    },
  );

  it.each(['40P01', '40001'])('maps %s (rolled back by PostgreSQL) to a retryable 409', (code) => {
    const result = body({ code, message: 'deadlock detected', details: 'Process 1 waits for ShareLock …' });
    expect(result.status).toBe(409);
    expect(result.response.code).toBe('EVALUATION_CONCURRENT_UPDATE');
    expect(JSON.stringify(result.response)).not.toContain('Process');
  });

  it('adds the existing evaluation id to a reused create key only when the detail is a valid id', () => {
    const id = '0F8E3B52-4A3C-4D7E-9B1A-2C3D4E5F6A7B';
    expect(body({ code: 'PZE11', message: 'evaluation_create_key_reused', details: `{"evaluationId" : "${id}"}` }).response)
      .toMatchObject({ code: 'EVALUATION_CREATE_KEY_REUSED', evaluationId: id.toLowerCase() });
    for (const details of [null, '', 'not json', '{"evaluationId":"x"}', '{"evaluationId":5}', `["${id}"]`]) {
      const response = body({ code: 'PZE11', message: 'evaluation_create_key_reused', details }).response;
      expect(response.code).toBe('EVALUATION_CREATE_KEY_REUSED');
      expect(response).not.toHaveProperty('evaluationId');
    }
  });

  it('turns anything unknown into a generic 500 without database text', () => {
    const result = body({ code: '23514', message: 'new row violates check constraint "x" SELECT secret', details: 'Failing row contains (secret text)' });
    expect(result.status).toBe(500);
    expect(result.response.code).toBe('EVALUATION_SERVER_ERROR');
    expect(JSON.stringify(result.response)).not.toMatch(/secret|constraint|Failing/);
  });

  it('never echoes the database message or details', () => {
    const result = body({ code: 'PZE08', message: 'evaluation_content_invalid_characters', details: 'private evaluation text' });
    expect(JSON.stringify(result.response)).not.toContain('private evaluation text');
    expect(JSON.stringify(result.response)).not.toContain('evaluation_content_invalid_characters');
  });
});
