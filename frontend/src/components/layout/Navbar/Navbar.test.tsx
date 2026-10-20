// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'MENTOR' as string, guest: false }));
vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => auth.guest
    ? { user: null, role: null, fullName: null, loading: false, signOut: vi.fn() }
    : { user: { id: 'u1', email: 'm@example.test' }, role: auth.role, fullName: 'Mentor One', loading: false, signOut: vi.fn() },
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

  it('opens the menu on small screens with the same links, and closes it with Escape or a link', () => {
    auth.role = 'INTERN';
    renderAt('/intern/dashboard');
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('mobile-navigation')).toBeNull();

    fireEvent.click(toggle);
    const menu = document.getElementById('mobile-navigation') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');
    const certificates = [...menu.querySelectorAll('a')].find((a) => a.textContent === 'Certificates') as HTMLAnchorElement;
    expect(certificates.getAttribute('href')).toBe('/intern/certificates');
    expect([...menu.querySelectorAll('a')].find((a) => a.textContent === 'Dashboard')?.getAttribute('aria-current')).toBe('page');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.getElementById('mobile-navigation')).toBeNull();
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    const link = [...(document.getElementById('mobile-navigation') as HTMLElement).querySelectorAll('a')].find((a) => a.textContent === 'Certificates') as HTMLAnchorElement;
    fireEvent.click(link);
    expect(document.getElementById('mobile-navigation')).toBeNull();
  });

  it.each([
    ['APPLICANT', 'My Profile', '/applicant/profile'],
    ['HR', 'HR Portal', '/hr/dashboard'],
    ['INTERN', 'Intern Portal', '/intern'],
    ['MENTOR', 'Mentor Portal', '/mentor'],
  ])('gives %s one named link (no nested button) to their area', (role, name, href) => {
    auth.role = role;
    renderAt('/');
    // APPLICANT also has "My Profile" in the main navigation.
    const links = screen.getAllByRole('link', { name });
    expect(links.some((link) => link.getAttribute('aria-label') === name && link.getAttribute('href') === href)).toBe(true);
    for (const link of links) expect(link.querySelector('button')).toBeNull();
  });

  it('shows applicants Home and My Profile, but no Internships link (desktop and mobile menu)', () => {
    auth.role = 'APPLICANT';
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Internships' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getAllByRole('link', { name: 'My Profile' }).map((link) => link.getAttribute('href'))).toContain('/applicant/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = document.getElementById('mobile-navigation') as HTMLElement;
    expect([...menu.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Home', 'My Profile']);
  });

  it('keeps the HR Internships link', () => {
    auth.role = 'HR';
    renderAt('/hr/dashboard');
    expect(screen.getByRole('link', { name: 'Internships' }).getAttribute('href')).toBe('/hr/internships');
  });
});

describe('Navbar for guests', () => {
  afterEach(() => { cleanup(); auth.guest = false; });

  it('keeps the public Internships link', () => {
    auth.guest = true;
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Internships' }).getAttribute('href')).toBe('/internships');
    expect(screen.getByRole('link', { name: 'Apply' }).getAttribute('href')).toBe('/apply');
  });
});
