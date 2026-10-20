import { createElement } from 'react';
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Internship } from '@/features/internships/types';

import { usePublicInternships } from './home-queries';
import Reveal from './Reveal';
import { trainingAreaIcon } from './training-area-icons';

// The company's training disciplines. Source: the training types HR lists
// for applicants (internships.is_active; public GET /internships, the same
// list the Apply page offers). A training type is named by its title; there
// is no description in the data, so none is shown. This section introduces
// the areas only: no availability, capacity or application status, and no
// apply action (applying stays with the page's Apply Now and the Apply page,
// where "Other" remains the option for an unlisted area).

function TrainingAreaCard({ area, index }: { area: Internship; index: number }) {
  return (
    <article
      aria-labelledby={`area-${area.id}`}
      className="group relative flex h-full min-h-[11rem] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background p-6 shadow-[0_1px_2px_rgba(17,45,78,0.05)] transition-[translate,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_44px_-28px_rgba(17,45,78,0.55)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Decorative: a soft wash and a faint dot pattern in the corner, a hairline accent on hover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-secondary/70 transition-[scale,background-color] duration-500 group-hover:scale-110 group-hover:bg-secondary motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 right-4 size-20 opacity-60 [background-image:radial-gradient(color-mix(in_oklab,var(--primary)_28%,transparent)_1px,transparent_1.5px)] [background-size:9px_9px] [mask-image:radial-gradient(circle_at_top_right,#000_25%,transparent_70%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl bg-background text-primary shadow-[0_6px_16px_-10px_rgba(17,45,78,0.45)] ring-1 ring-primary/15 transition-[background-color,color,rotate] duration-300 group-hover:bg-primary group-hover:text-primary-foreground motion-safe:group-hover:-rotate-3">
          {createElement(trainingAreaIcon(area.title), { className: 'size-[22px]', 'aria-hidden': true })}
        </span>
        <span aria-hidden="true" className="relative pt-1 font-mono text-xs tracking-wider text-foreground/40 tabular-nums">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <h3
        id={`area-${area.id}`}
        className="relative mt-8 line-clamp-2 text-lg leading-7 font-semibold tracking-tight text-foreground"
        title={area.title}
      >
        {area.title}
      </h3>
    </article>
  );
}

export default function TrainingAreas() {
  const areas = usePublicInternships();

  return (
    <section
      id="training-areas"
      aria-labelledby="training-areas-heading"
      className="relative scroll-mt-20 border-y border-border/70 bg-secondary/35"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Disciplines</p>
          <h2
            id="training-areas-heading"
            tabIndex={-1}
            className="mt-3 text-3xl font-semibold tracking-tight text-foreground outline-none sm:text-4xl"
          >
            Training Areas
          </h2>
          <p className="mt-4 text-base leading-7 text-foreground/70">
            Explore the areas in which you can build practical skills during your internship, guided by an
            assigned mentor.
          </p>
        </Reveal>

        <div className="mt-12">
          {areas.isPending && (
            <div role="status" aria-label="Loading training areas" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-44 rounded-2xl bg-secondary/80" />
              ))}
            </div>
          )}

          {areas.isError && (
            <div className="rounded-2xl border border-border bg-background p-6 text-center sm:p-8">
              <p className="font-medium text-foreground">We could not load the training areas right now.</p>
              <p className="mt-1 text-sm text-foreground/70">Check your connection and try again.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                onClick={() => void areas.refetch()}
                disabled={areas.isFetching}
              >
                <RotateCw data-icon="inline-start" className={areas.isFetching ? 'animate-spin' : undefined} />
                Try again
              </Button>
            </div>
          )}

          {areas.isSuccess && areas.data.length === 0 && (
            <div className="rounded-2xl border border-border bg-background p-6 text-center sm:p-8">
              <p className="font-medium text-foreground">Our training areas will be listed here soon.</p>
            </div>
          )}

          {areas.isSuccess && areas.data.length > 0 && (
            <>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-5">
                {areas.data.map((area, index) => (
                  <li key={area.id}>
                    <Reveal delay={Math.min(index, 7) * 50} className="h-full">
                      <TrainingAreaCard area={area} index={index} />
                    </Reveal>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-sm text-foreground/65">
                Interested in a different area? When you apply, choose &ldquo;Other&rdquo; and describe it.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
