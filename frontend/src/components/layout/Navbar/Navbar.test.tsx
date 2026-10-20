// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'MENTOR' as string }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'm@example.test' }, role: auth.role, fullName: 'Mentor One', loading: false, signOut: vi.fn() }),
}));

import Navbar from './Navbar';

function renderAt(pathname: string) {
  render(<MemoryRouter initialEntries={[pathname]}><Navbar /></MemoryRouter>);
}

// The active link has the 'text-foreground' class; inactive links are muted.
const isHighlighted = (name: string) => {
  const classes = screen.getByRole('link', { name }).className.split(/\s+/);
  return classes.includes('text-foreground') && !classes.includes('text-muted-foreground');
};

describe('Navbar', () => {
  afterEach(() => { cleanup(); });

  it('highlights only Evaluations under /mentor/evaluations', () => {
    auth.role = 'MENTOR';
    renderAt('/mentor/evaluations/placement-1');
    expect(isHighlighted('Evaluations')).toBe(true);
    expect(isHighlighted('Assigned Interns')).toBe(false);
  });

  it('highlights Assigned Interns on the Mentor home', () => {
    auth.role = 'MENTOR';
    renderAt('/mentor');
    expect(isHighlighted('Assigned Interns')).toBe(true);
    expect(isHighlighted('Evaluations')).toBe(false);
  });

  it('highlights only the Intern Evaluations link on an evaluation page', () => {
    auth.role = 'INTERN';
    renderAt('/intern/evaluations/e1');
    expect(isHighlighted('Evaluations')).toBe(true);
    expect(isHighlighted('Weekly Reports')).toBe(false);
    expect(isHighlighted('Home')).toBe(false);
  });

  it('offers interns a Certificates link, highlighted on a certificate page', () => {
    auth.role = 'INTERN';
    renderAt('/intern/certificates/11111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: 'Certificates' }).getAttribute('href')).toBe('/intern/certificates');
    expect(isHighlighted('Certificates')).toBe(true);
    expect(isHighlighted('Evaluations')).toBe(false);
  });

  it.each(['HR', 'MENTOR', 'ADMIN', 'APPLICANT'])('offers no certificate link to %s', (role) => {
    auth.role = role;
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Certificates' })).toBeNull();
  });
});
