// HTTP server settings read once at startup: the browser origins allowed by
// CORS and the listening port. Invalid or (in production) missing settings
// stop the server instead of falling back to something permissive.
//
// Origins, in order of precedence:
//   CORS_ORIGINS  comma-separated list of exact origins (scheme://host[:port])
//   FRONTEND_URL  the frontend's public address (its origin is used)
//   development/test only: http://localhost:5173
// A wildcard is never accepted, and credentials (cookies) are not enabled:
// the API is called with a bearer token.

export interface HttpServerSettings {
  corsOrigins: string[];
  port: number;
}

type Env = Record<string, string | undefined>;

const DEVELOPMENT_ORIGIN = 'http://localhost:5173';
const DEFAULT_PORT = 3000;

export class HttpServerConfigError extends Error {}

function parseOrigin(value: string, production: boolean): string {
  if (value === '*' || value.includes('*')) {
    throw new HttpServerConfigError('CORS origins must be exact origins; a wildcard is not allowed.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpServerConfigError(`CORS origin is not a valid URL: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HttpServerConfigError(`CORS origin must use http or https: ${value}`);
  }
  if (production && url.protocol !== 'https:') {
    throw new HttpServerConfigError(`CORS origin must use https in production: ${value}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new HttpServerConfigError(`CORS origin must not contain credentials, a query or a fragment: ${value}`);
  }
  // FRONTEND_URL may carry a trailing slash or a path; CORS_ORIGINS must not.
  return url.origin;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value.trim())) throw new HttpServerConfigError(`PORT must be an integer: ${value}`);
  const port = Number(value.trim());
  if (port < 1 || port > 65535) throw new HttpServerConfigError(`PORT must be between 1 and 65535: ${value}`);
  return port;
}

export function resolveHttpServerSettings(env: Env): HttpServerSettings {
  const production = env.NODE_ENV === 'production';
  const listed = (env.CORS_ORIGINS ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
  const frontendUrl = env.FRONTEND_URL?.trim();

  let origins: string[];
  if (listed.length > 0) {
    origins = listed.map((origin) => {
      const parsed = parseOrigin(origin, production);
      if (parsed !== origin.replace(/\/$/, '')) {
        throw new HttpServerConfigError(`CORS origin must not contain a path: ${origin}`);
      }
      return parsed;
    });
  } else if (frontendUrl) {
    origins = [parseOrigin(frontendUrl, production)];
  } else if (production) {
    throw new HttpServerConfigError('Set CORS_ORIGINS (or FRONTEND_URL) to the frontend origin when NODE_ENV=production.');
  } else {
    origins = [DEVELOPMENT_ORIGIN];
  }

  return { corsOrigins: [...new Set(origins)], port: parsePort(env.PORT) };
}
