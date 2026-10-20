import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  MapPin,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { userScopedKey } from '@/lib/query-client';
import { useMyInternPlacement } from '@/features/intern/hooks/useMyInternPlacement';
import { placementBadge } from '@/features/intern/placement-status';
import { MY_REPORTS_KEY, mondayOf, REPORT_STATUS_LABELS } from '@/features/intern/report-weeks';
import { getMyWeeklyReports } from '@/features/intern/services/weekly-reports.service';
import { localIsoDate } from '@/features/intern/dates';
import { placementErrorMessage } from '@/features/intern/services/intern-placement.service';
import type { MyInternPlacement } from '@/features/intern/types';

function InternDashboard() {
  const { fullName, user } = useAuth();
  const placementQuery = useMyInternPlacement();
  const placement = placementQuery.data;
  const firstName = (fullName ?? user?.email ?? 'there').split(/[\s@]/)[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
      <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-7 text-primary-foreground shadow-sm sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full border-[36px] border-white/10" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-medium text-primary-foreground/75">INTERN WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome, {firstName}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
            Your internship details and training information are gathered here.
          </p>
          <Link to="/intern/my-internship" className="mt-6 inline-flex">
            <Button variant="secondary">
              View my internship <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </section>

      {placementQuery.isPending ? (
        <PlacementLoading />
      ) : placementQuery.isError ? (
        <PlacementError error={placementQuery.error} onRetry={() => void placementQuery.refetch()} />
      ) : placement ? (
        <ActivePlacement placement={placement} />
      ) : (
        <NoPlacement />
      )}
    </div>
  );
}

function ActivePlacement({ placement }: { placement: MyInternPlacement }) {
  return (
    <>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">{placement.status === 'COMPLETED' ? 'YOUR COMPLETED PLACEMENT' : 'YOUR CURRENT PLACEMENT'}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{placement.trainingTitle}</h2>
        </div>
        <Badge className={`w-fit ${placementBadge(placement).className}`}>{placementBadge(placement).label}</Badge>
      </div>
      {placement.status === 'COMPLETED' && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Your internship has ended. Your weekly reports and feedback stay available to read.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard icon={BriefcaseBusiness} label="Company" value={placement.company} />
        <OverviewCard icon={MapPin} label="Department" value={placement.department || 'Not specified'} />
        <OverviewCard icon={CalendarDays} label="Training period" value={`${formatDate(placement.startDate)} – ${formatDate(placement.endDate)}`} />
        <OverviewCard icon={Clock3} label="Duration" value={duration(placement.startDate, placement.endDate)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Internship overview</CardTitle>
            <CardDescription className="mt-1">Your placement information currently available to the portal.</CardDescription>
          </div>
          <span className="hidden size-10 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <BriefcaseBusiness className="size-5" />
          </span>
        </CardHeader>
        <CardContent className="grid gap-5 border-t pt-5 sm:grid-cols-3">
          <Detail label="Training title" value={placement.trainingTitle} />
          <Detail label="Company" value={placement.company} />
          <Detail label="Department" value={placement.department || 'Not specified'} />
          <Detail label="Start date" value={formatDate(placement.startDate)} />
          <Detail label="End date" value={formatDate(placement.endDate)} />
          <Detail label="Status" value={placementBadge(placement).label} />
          <Detail
            label="Mentor"
            value={placement.mentor
              ? [placement.mentor.fullName, placement.mentor.email].filter(Boolean).join(' · ') || 'Assigned'
              : 'Not assigned yet'}
          />
        </CardContent>
      </Card>

      <WorkSummary />
    </>
  );
}

// Live weekly-report status, with a link to act on it.
function WorkSummary() {
  const { user } = useAuth();
  const reports = useQuery({ queryKey: userScopedKey(MY_REPORTS_KEY, user?.id), queryFn: getMyWeeklyReports, retry: false });
  const thisWeek = mondayOf(localIsoDate());
  const currentReport = (reports.data ?? []).find((report) => report.weekStart === thisWeek);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>This week’s report</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {reports.isPending ? <p className="text-muted-foreground">Loading…</p>
            : reports.isError ? <p className="text-destructive">{reports.error.message}</p>
              : <p>{currentReport ? REPORT_STATUS_LABELS[currentReport.status] : 'Not started yet'}</p>}
          <Link to="/intern/training-reports"><Button variant="outline">Weekly reports <ArrowRight className="ml-2 size-4" /></Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewCard({ icon: Icon, label, value }: { icon: typeof BriefcaseBusiness; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 truncate font-semibold" title={value}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function PlacementLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading internship information">
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />)}
    </div>
  );
}

function PlacementError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
        <p className="font-semibold">Placement information is unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">{placementErrorMessage(error)}</p>
        </div>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      </CardContent>
    </Card>
  );
}

function NoPlacement() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BriefcaseBusiness className="size-5" />
        </span>
        <div>
          <p className="font-semibold">No active placement is available</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your internship information will appear here after a placement has been assigned and activated.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function duration(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  if (months === 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
  return remainingDays ? `${months} mo ${remainingDays} d` : `${months} ${months === 1 ? 'month' : 'months'}`;
}

export default InternDashboard;
