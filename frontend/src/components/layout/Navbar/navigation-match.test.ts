import { describe, expect, it } from 'vitest';

import { isNavigationItemActive, matchesNavigationPath } from './navigation-match';

const mentor = ['/mentor', '/mentor/evaluations'];
const intern = ['/', '/intern/dashboard', '/intern/my-internship', '/intern/training-reports', '/intern/evaluations'];
const active = (pathname: string, paths: string[]) => paths.filter((path) => isNavigationItemActive(pathname, path, paths));

describe('Navbar active link', () => {
  it('highlights only the most specific Mentor link', () => {
    expect(active('/mentor/evaluations', mentor)).toEqual(['/mentor/evaluations']);
    expect(active('/mentor/evaluations/placement-1', mentor)).toEqual(['/mentor/evaluations']);
    expect(active('/mentor', mentor)).toEqual(['/mentor']);
    expect(active('/mentor/dashboard', mentor)).toEqual(['/mentor']);
  });

  it('keeps the existing Intern matching', () => {
    expect(active('/intern/evaluations/e1', intern)).toEqual(['/intern/evaluations']);
    expect(active('/intern/training-reports', intern)).toEqual(['/intern/training-reports']);
    expect(active('/intern', intern)).toEqual([]);
  });

  it('matches Home only on the home page', () => {
    expect(matchesNavigationPath('/', '/')).toBe(true);
    expect(matchesNavigationPath('/internships', '/')).toBe(false);
    expect(active('/internships', ['/', '/internships', '/apply'])).toEqual(['/internships']);
  });
});
