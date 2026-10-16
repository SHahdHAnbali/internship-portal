import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Development-only behavior (such as the review email override) is refused
// unless NODE_ENV is development or test, so the production start command
// must set NODE_ENV=production explicitly.
const scripts = (
  JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

describe('production start script', () => {
  it('runs the compiled app with NODE_ENV=production', () => {
    expect(scripts['start:prod']).toBe('NODE_ENV=production node dist/main');
  });
});
