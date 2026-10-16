import { UnauthorizedException } from '@nestjs/common';

import { parseOptionalBearerToken } from './optional-bearer-token.js';

describe('parseOptionalBearerToken', () => {
  it('treats a missing header as unauthenticated', () => {
    expect(parseOptionalBearerToken(undefined)).toBeNull();
    expect(parseOptionalBearerToken('  ')).toBeNull();
  });

  it('returns the bearer token', () => {
    expect(parseOptionalBearerToken('Bearer abc.def ')).toBe('abc.def');
  });

  it.each(['Basic abc', 'Bearer ', 'abc'])('rejects a malformed header (%s)', (header) => {
    expect(() => parseOptionalBearerToken(header)).toThrow(UnauthorizedException);
  });
});
