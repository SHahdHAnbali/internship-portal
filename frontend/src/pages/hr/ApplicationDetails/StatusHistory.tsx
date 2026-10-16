import { History } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { APPLICATION_STATUS_LABELS } from '@/features/applications/status';
import type { ApplicationStatusEvent } from '@/features/applications/types';

// HR-only audit timeline: who changed the status, when, and why.
export default function StatusHistory({ events }: { events: ApplicationStatusEvent[] }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" /> Status history
        </h2>

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recorded changes. History is kept for changes made since 11 Oct 2026.
          </p>
        ) : (
          <ol className="space-y-4 border-l pl-4">
            {[...events].reverse().map((event) => (
              <li key={event.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-[#3F72AF]" />
                <p className="font-medium">
                  {event.fromStatus === 'DRAFT'
                    ? 'Submitted by the applicant'
                    : `${APPLICATION_STATUS_LABELS[event.fromStatus]} → ${APPLICATION_STATUS_LABELS[event.toStatus]}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                  {event.actor && event.fromStatus !== 'DRAFT' && ` · ${event.actor.fullName ?? 'HR'}`}
                </p>
                {event.reason && (
                  <p className="mt-1.5 text-muted-foreground">
                    <span className="font-medium text-foreground">Reason (shown to applicant):</span> {event.reason}
                  </p>
                )}
                {event.note && (
                  <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">
                    <span className="font-medium text-foreground">Internal note:</span> {event.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
