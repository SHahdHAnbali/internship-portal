import { HttpServerConfigError, resolveHttpServerSettings } from './http-server.config.js';

describe('HTTP server settings', () => {
  it('keeps the local development workflow without any setting', () => {
    expect(resolveHttpServerSettings({ NODE_ENV: 'development' })).toEqual({ corsOrigins: ['http://localhost:5173'], port: 3000 });
    expect(resolveHttpServerSettings({})).toEqual({ corsOrigins: ['http://localhost:5173'], port: 3000 });
  });

  it('uses the frontend origin from FRONTEND_URL (ignoring a trailing slash or path)', () => {
    expect(resolveHttpServerSettings({ FRONTEND_URL: 'http://localhost:5173/' }).corsOrigins).toEqual(['http://localhost:5173']);
    expect(resolveHttpServerSettings({ NODE_ENV: 'production', FRONTEND_URL: 'https://portal.example.org/app' }).corsOrigins)
      .toEqual(['https://portal.example.org']);
  });

  it('prefers an explicit CORS_ORIGINS list', () => {
    expect(resolveHttpServerSettings({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://portal.example.org',
      CORS_ORIGINS: 'https://portal.example.org, https://staff.example.org,https://portal.example.org',
    }).corsOrigins).toEqual(['https://portal.example.org', 'https://staff.example.org']);
  });

  it('refuses to start in production without an origin', () => {
    expect(() => resolveHttpServerSettings({ NODE_ENV: 'production' })).toThrow(HttpServerConfigError);
    expect(() => resolveHttpServerSettings({ NODE_ENV: 'production', CORS_ORIGINS: ' , ' })).toThrow(HttpServerConfigError);
  });

  it.each([
    ['*'],
    ['https://*.example.org'],
    ['not a url'],
    ['ftp://portal.example.org'],
    ['https://user:pass@portal.example.org'],
    ['https://portal.example.org/path'],
    ['https://portal.example.org?x=1'],
  ])('refuses the origin %s', (origin) => {
    expect(() => resolveHttpServerSettings({ CORS_ORIGINS: origin })).toThrow(HttpServerConfigError);
  });

  it('requires https origins in production', () => {
    expect(() => resolveHttpServerSettings({ NODE_ENV: 'production', CORS_ORIGINS: 'http://portal.example.org' }))
      .toThrow(HttpServerConfigError);
    expect(() => resolveHttpServerSettings({ NODE_ENV: 'production', FRONTEND_URL: 'http://portal.example.org' }))
      .toThrow(HttpServerConfigError);
  });

  it('reads and validates PORT', () => {
    expect(resolveHttpServerSettings({ PORT: '8080' }).port).toBe(8080);
    for (const port of ['0', '70000', 'abc', '30.5', '-1']) {
      expect(() => resolveHttpServerSettings({ PORT: port })).toThrow(HttpServerConfigError);
    }
  });
});
