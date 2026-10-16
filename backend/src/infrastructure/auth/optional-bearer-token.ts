import { UnauthorizedException } from '@nestjs/common';

// For public endpoints that also accept the caller's own session. A missing
// header means "unauthenticated"; a present but malformed header is rejected
// rather than silently treated as anonymous.
export function parseOptionalBearerToken(
  authorization: string | undefined,
): string | null {
  if (authorization === undefined || authorization.trim() === '') {
    return null;
  }

  if (!authorization.startsWith('Bearer ')) {
    throw new UnauthorizedException('Authentication required');
  }

  const accessToken = authorization.slice(7).trim();
  if (!accessToken) {
    throw new UnauthorizedException('Authentication required');
  }

  return accessToken;
}
