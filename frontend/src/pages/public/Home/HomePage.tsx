import type { CSSProperties } from 'react';
import { ArrowRight, Award, BookOpenCheck, Users, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import Footer from '@/components/layout/Footer/Footer';
import Navbar from '@/components/layout/Navbar/Navbar';
import { buttonVariants } from '@/components/ui/button';
import type { UserRole } from '@/features/auth/auth-context';
import { useAuth } from '@/features/auth/auth-context';

import HeroJourneyArt from './HeroJourneyArt';
import { useApplicationIntake } from './home-queries';
import HowItWorks from './HowItWorks';
import Reveal from './Reveal';
import { scrollToSection } from './scroll-to-section';
import TrainingAreas from './TrainingAreas';

import './home.css';

// Where each signed-in role continues from the homepage (AGENTS.md, "Home
// Page CTA Behavior"); guests are offered Sign In.
const ROLE_DESTINATION: Record<UserRole, { label: string; to: string }> = {
  APPLICANT: { label: 'My Profile', to: '/applicant/profile' },
  HR: { label: 'HR Dashboard', to: '/hr/dashboard' },
  ADMIN: { label: 'Admin Dashboard', to: '/admin/dashboard' },
  INTERN: { label: 'Intern Portal', to: '/intern' },
  MENTOR: { label: 'Mentor Portal', to: '/mentor' },
};

// What an internship here involves, as the portal implements it.
const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: BookOpenCheck,
    title: 'Hands-on practice',
    text: 'Apply what you have studied in a real working environment, in the training area you choose.',
  },
  {
    icon: Users,
    title: 'Guided by a mentor',
    text: 'Once your internship starts, an assigned mentor follows your progress, reviews your weekly reports and writes evaluations.',
  },
  {
    icon: Award,
    title: 'Certificate of completion',
    text: 'Complete your internship and receive a certificate of completion that you can print or save as a PDF.',
  },
];

const rise = (delay: number) => ({ '--home-delay': `${delay}ms` }) as CSSProperties;

export default function HomePage() {
  const { user, role, loading } = useAuth();
  const intake = useApplicationIntake();
  const destination = user && role ? ROLE_DESTINATION[role] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1 overflow-x-clip">
        {/* Hero */}
        <section aria-labelledby="home-heading" className="home-hero-backdrop relative border-b border-border/70">
          <div aria-hidden="true" className="home-hero-grid pointer-events-none absolute inset-0" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 md:py-28 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:py-32">
            <div className="max-w-2xl">
              <div className="home-rise flex flex-wrap items-center gap-2" style={rise(0)}>
                <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80">
                  Internship &amp; practical training program
                </span>
                {intake.data && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-foreground/80"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        intake.data.applicationsOpen
                          ? 'home-pulse-dot size-2 rounded-full bg-emerald-600 text-emerald-600'
                          : 'size-2 rounded-full bg-foreground/35'
                      }
                    />
                    {intake.data.applicationsOpen ? 'Applications are open' : 'Applications are currently closed'}
                  </span>
                )}
              </div>

              <h1
                id="home-heading"
                className="home-rise mt-7 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
                style={rise(80)}
              >
                Start Your <span className="text-primary">Internship</span> Journey
              </h1>

              <p
                className="home-rise mt-6 max-w-xl text-base leading-7 text-foreground/75 sm:text-lg sm:leading-8"
                style={rise(160)}
              >
                Gain practical experience, build real skills and learn with guidance from an assigned mentor. Find
                the training area that fits you and apply in a few simple steps.
              </p>

              <div className="home-rise mt-9 flex flex-col gap-3 sm:flex-row sm:items-center" style={rise(240)}>
                {/* Exploring scrolls to the training areas; applying stays on the Apply page. */}
                <a
                  href="#training-areas"
                  onClick={(event) => scrollToSection(event, 'training-areas')}
                  className={buttonVariants({
                    size: 'lg',
                    className: 'h-11 w-full px-5 text-[0.95rem] shadow-[0_10px_24px_-12px_rgba(63,114,175,0.9)] sm:w-auto',
                  })}
                >
                  Explore Internships
                  <ArrowRight data-icon="inline-end" />
                </a>
                <a
                  href="#how-it-works"
                  onClick={(event) => scrollToSection(event, 'how-it-works')}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background/80 px-5 text-[0.95rem] font-medium text-foreground outline-none transition-colors hover:border-primary/40 hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  How It Works
                </a>
              </div>

              {!loading && (
                <p className="home-rise mt-6 text-sm text-foreground/65" style={rise(320)}>
                  {destination ? (
                    <Link
                      to={destination.to}
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      Go to {destination.label}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <>
                      Already applied?{' '}
                      <Link
                        to="/login"
                        className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
                      >
                        Sign in
                      </Link>{' '}
                      to follow your application.
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="home-rise hidden lg:block" style={rise(200)}>
              <HeroJourneyArt />
            </div>
          </div>
        </section>

        {/* What an internship offers */}
        <section aria-labelledby="benefits-heading">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Learning by doing</p>
              <h2 id="benefits-heading" className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Practical training with guidance at every step
              </h2>
            </Reveal>

            <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="bg-background">
                  <Reveal delay={index * 90} className="group h-full p-7 transition-colors duration-200 hover:bg-secondary/30 sm:p-8">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-[translate,background-color,color] duration-300 group-hover:-translate-y-0.5 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-foreground/70">{text}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <TrainingAreas />

        <HowItWorks />
      </main>

      <Footer />
    </div>
  );
}
