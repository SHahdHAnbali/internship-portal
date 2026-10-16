import { formatDateTime } from '../format';
import { ROLE_LABELS, type AdminAuditEvent } from '../types';
import type { UserRole } from '@/features/auth/auth-context';

// Read-only list of administrative account changes (who, what, when, why).
export default function AuditTrail({ events }: { events: AdminAuditEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No account changes have been recorded yet.</p>;
  }

  return (
    <ol className="space-y-3 border-l pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
          <p className="font-medium">{describe(event)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(event.createdAt)}
            {event.type !== 'ADMIN_BOOTSTRAPPED' && ` · by ${event.actorName ?? event.actorEmail ?? 'a removed account'}`}
          </p>
          {event.note && (
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              <span className="font-medium text-foreground">Reason:</span> {event.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function roleLabel(value: unknown) {
  return typeof value === 'string' && value in ROLE_LABELS ? ROLE_LABELS[value as UserRole] : 'unknown role';
}

function describe(event: AdminAuditEvent) {
  switch (event.type) {
    case 'ADMIN_BOOTSTRAPPED':
      return `${event.targetEmail} set up as the first administrator`;
    case 'USER_CREATED':
      return `${event.targetEmail} added as ${roleLabel(event.details.role)}`;
    case 'ROLE_CHANGED':
      return `${event.targetEmail}: ${roleLabel(event.details.fromRole)} → ${roleLabel(event.details.toRole)}`;
    case 'USER_DEACTIVATED':
      return `${event.targetEmail} deactivated`;
    case 'USER_REACTIVATED':
      return `${event.targetEmail} reactivated`;
    case 'SETTING_UPDATED':
      return event.details.setting === 'applicationsOpen'
        ? (event.details.to ? 'Application intake opened' : 'Application intake closed')
        : 'Portal setting changed';
    default:
      return event.targetEmail ?? 'Account change';
  }
}
