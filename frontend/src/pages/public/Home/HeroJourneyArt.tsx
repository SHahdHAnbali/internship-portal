import type { CSSProperties } from 'react';
import { Compass, FileText, Sprout, type LucideIcon } from 'lucide-react';

const NODES: { icon: LucideIcon; label: string; caption: string; left: string; top: string; delay: number }[] = [
  { icon: Compass, label: 'Explore', caption: 'Find your training area', left: '27%', top: '17%', delay: 0 },
  { icon: FileText, label: 'Apply', caption: 'Send and review your CV', left: '73%', top: '50%', delay: 900 },
  { icon: Sprout, label: 'Learn & Grow', caption: 'Practise with a mentor', left: '27%', top: '83%', delay: 1800 },
];

// Decorative only (aria-hidden): the three stages of the internship journey
// joined by a slowly moving dashed path. The steps themselves are explained
// in text in the "How it works" section.
export default function HeroJourneyArt() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-[10/9] w-full max-w-md select-none">
      <div className="absolute inset-0 rounded-[2rem] border border-border/80 bg-card/60 shadow-[0_30px_80px_-40px_rgba(17,45,78,0.45)] backdrop-blur-sm" />

      <svg viewBox="0 0 400 360" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <linearGradient id="home-journey-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path
          d="M108 61 C 250 61, 292 120, 292 180 S 180 299, 108 299"
          stroke="var(--secondary)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          className="home-journey-path"
          d="M108 61 C 250 61, 292 120, 292 180 S 180 299, 108 299"
          stroke="url(#home-journey-stroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {NODES.map(({ icon: Icon, label, caption, left, top, delay }) => (
        <div
          key={label}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left, top }}
        >
          <div
            className="home-float flex items-center gap-3 rounded-xl border border-border bg-background/95 px-3.5 py-2.5 shadow-sm"
            style={{ '--home-delay': `${delay}ms` } as CSSProperties}
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Icon className="size-4.5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block whitespace-nowrap text-xs text-muted-foreground">{caption}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
