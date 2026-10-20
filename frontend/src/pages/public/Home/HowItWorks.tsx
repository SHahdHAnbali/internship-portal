import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Compass, FileText, Sprout, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';

import Reveal from './Reveal';
import { scrollToSection } from './scroll-to-section';

interface Step {
  icon: LucideIcon;
  title: string;
  summary: string;
  details: string[];
  // An in-page section (#id: explore) or a route (apply).
  action: { label: string; to: string };
}

// The applicant journey as the portal implements it (Apply page, review
// link, one application per applicant, placement with a Mentor, weekly
// reports, evaluations, certificate of completion).
const STEPS: Step[] = [
  {
    icon: Compass,
    title: 'Explore Opportunities',
    summary:
      'Browse the internships currently offered and choose the training area that matches your interests and goals.',
    details: [
      'See every training area listed for internship applications.',
      'Interested in an area that is not listed? You can request it when you apply.',
    ],
    action: { label: 'Explore training areas', to: '#training-areas' },
  },
  {
    icon: FileText,
    title: 'Apply for an Internship',
    summary:
      'Upload your CV and our system extracts the relevant information. We then email you a link to review and correct it before you submit.',
    details: [
      'CV as PDF or DOCX, up to 5 MB.',
      'The review link is valid for 24 hours. Nothing is submitted until you confirm it.',
      'Each applicant can submit one application.',
    ],
    action: { label: 'Apply Now', to: '/apply' },
  },
  {
    icon: Sprout,
    title: 'Learn & Grow',
    summary:
      'HR reviews every application. If you are selected, your internship is arranged with an assigned mentor who guides your progress.',
    details: [
      'Share what you work on and learn in weekly reports.',
      'Receive written evaluations from your mentor.',
      'Get a certificate of completion when your internship is completed.',
    ],
    action: { label: 'Explore training areas', to: '#training-areas' },
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const step = STEPS[active];

  function select(index: number) {
    const next = (index + STEPS.length) % STEPS.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, () => void> = {
      ArrowDown: () => select(active + 1),
      ArrowRight: () => select(active + 1),
      ArrowUp: () => select(active - 1),
      ArrowLeft: () => select(active - 1),
      Home: () => select(0),
      End: () => select(STEPS.length - 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      move();
    }
  }

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="scroll-mt-20">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2
            id="how-it-works-heading"
            tabIndex={-1}
            className="mt-3 text-3xl font-semibold tracking-tight text-foreground outline-none sm:text-4xl"
          >
            Your path from application to internship
          </h2>
          <p className="mt-4 text-base leading-7 text-foreground/70">
            Three stages, each with a clear next step. Select a stage to see what happens.
          </p>
        </Reveal>

        <Reveal className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12" delay={80}>
          <div role="tablist" aria-orientation="vertical" aria-label="Internship journey" className="relative flex flex-col gap-3 self-start">
            {STEPS.map((item, index) => {
              const selected = index === active;
              const done = index < active;
              return (
                <button
                  key={item.title}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${index}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(index)}
                  onKeyDown={onKeyDown}
                  className={[
                    'relative flex items-start gap-4 rounded-xl border px-3 py-3 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-ring/40 motion-reduce:transition-none',
                    selected
                      ? 'border-primary/40 bg-background shadow-[0_14px_40px_-24px_rgba(17,45,78,0.55)]'
                      : 'border-transparent hover:border-border hover:bg-background/70',
                  ].join(' ')}
                >
                  {/* Connector to the next step's number (filled once this step is done). */}
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-[44px] -bottom-[24px] left-[27.5px] w-px transition-colors ${done ? 'bg-primary' : 'bg-border'}`}
                    />
                  )}
                  <span
                    className={[
                      'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                      selected || done
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground/70',
                    ].join(' ')}
                  >
                    {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className={`block font-semibold ${selected ? 'text-foreground' : 'text-foreground/80'}`}>
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-foreground/65 lg:line-clamp-2">{item.summary}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${active}`}
            tabIndex={0}
            className="rounded-2xl border border-border bg-background p-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:p-8"
          >
            <div key={active} className="home-step-panel">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-foreground/60">
                  Step {active + 1} of {STEPS.length}
                </p>
              </div>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{step.title}</h3>
              <p className="mt-3 text-base leading-7 text-foreground/75">{step.summary}</p>
              <ul className="mt-6 space-y-3">
                {step.details.map((detail) => (
                  <li key={detail} className="flex gap-3 text-sm leading-6 text-foreground/80">
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {step.action.to.startsWith('#') ? (
                  <a
                    href={step.action.to}
                    onClick={(event) => scrollToSection(event, step.action.to.slice(1))}
                    className={buttonVariants({ size: 'lg', className: 'h-10 px-4' })}
                  >
                    {step.action.label}
                  </a>
                ) : (
                  <Link to={step.action.to} className={buttonVariants({ size: 'lg', className: 'h-10 px-4' })}>
                    {step.action.label}
                  </Link>
                )}
                {active < STEPS.length - 1 && (
                  <Button type="button" variant="ghost" size="lg" className="h-10 px-3" onClick={() => setActive(active + 1)}>
                    Next: {STEPS[active + 1].title}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
