import type { MouseEvent } from 'react';

// In-page links on the homepage: scroll smoothly (instantly with reduced
// motion), keep the #anchor in the address bar and move keyboard focus to
// the section heading (`${id}-heading`, tabIndex -1). Without JavaScript the
// plain #anchor still works.
export function scrollToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
  document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
}
