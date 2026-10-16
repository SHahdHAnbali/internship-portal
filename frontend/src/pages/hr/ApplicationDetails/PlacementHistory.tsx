import { History } from 'lucide-react';

import type { HrPlacementEvent } from '@/features/hr/services/intern-placement.service';

const EVENT_LABELS: Record<HrPlacementEvent['type'], string> = {
  CREATED: 'Placement scheduled',
  ACTIVATED: 'Placement activated — the applicant became an intern',
  CANCELLED: 'Placement cancelled',
  COMPLETED: 'Placement completed',
  MENTOR_ASSIGNED: 'Mentor assigned',
  MENTOR_UNASSIGNED: 'Mentor removed',
};

// HR-only audit timeline of placement lifecycle events.
export default function PlacementHistory({ events }: { events: HrPlacementEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4" /> Placement history
      </h3>
      <ol className="space-y-3 border-l pl-4">
        {[...events].reverse().map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-[#3F72AF]" />
            <p className="font-medium">{EVENT_LABELS[event.type] ?? event.type}</p>
            {mentorChange(event) && <p className="text-muted-foreground">{mentorChange(event)}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(event.createdAt)}
              {event.actorName && ` · ${event.actorName}`}
            </p>
            {event.note && (
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                <span className="font-medium text-foreground">Reason:</span> {event.note}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function mentorChange(event: HrPlacementEvent) {
  const name = (value: unknown) => (typeof value === 'string' && value ? value : null);
  const from = name(event.details.fromMentorName);
  const to = name(event.details.toMentorName);
  if (event.type === 'MENTOR_ASSIGNED') return from ? `${from} → ${to ?? 'Mentor'}` : to;
  if (event.type === 'MENTOR_UNASSIGNED') return from;
  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
