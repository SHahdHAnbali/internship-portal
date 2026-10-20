import { useMyInternPlacement } from '@/features/intern/hooks/useMyInternPlacement';
import { placementBadge } from '@/features/intern/placement-status';
import { placementErrorMessage } from '@/features/intern/services/intern-placement.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Award, BriefcaseBusiness, CalendarDays, LoaderCircle, MapPin, RotateCw, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyInternship() {
  const query = useMyInternPlacement();
  const placement = query.data;

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">PLACEMENT DETAILS</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My Internship</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review the placement details assigned to you.</p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-56 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your placement…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
            <AlertCircle className="size-6 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load your internship</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {placementErrorMessage(query.error)}
              </p>
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}>
              <RotateCw className="mr-2 size-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : !placement ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BriefcaseBusiness className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">No active placement yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              When your internship placement is assigned and activated, its dates, company, and training details will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="h-2 bg-primary" />
            <CardHeader className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <CardDescription>Training placement</CardDescription>
                <CardTitle className="mt-2 text-2xl">{placement.trainingTitle}</CardTitle>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <BriefcaseBusiness className="size-4" /> {placement.company}
                </p>
              </div>
              <Badge className={`w-fit ${placementBadge(placement).className}`}>
                {placementBadge(placement).label}
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-6 border-t pt-6 sm:grid-cols-2">
              <Detail icon={MapPin} label="Department" value={placement.department || 'Not specified'} />
              <Detail icon={CalendarDays} label="Training dates" value={`${formatDate(placement.startDate)} – ${formatDate(placement.endDate)}`} />
              <Detail label="Start date" value={formatDate(placement.startDate)} />
              <Detail label="End date" value={formatDate(placement.endDate)} />
              <Detail
                icon={UserRound}
                label="Mentor"
                value={placement.mentor
                  ? [placement.mentor.fullName, placement.mentor.email].filter(Boolean).join(' · ') || 'Assigned'
                  : 'Not assigned yet — HR will assign your Mentor'}
              />
            </CardContent>
          </Card>
          {placement.status === 'COMPLETED' && (
            <Card>
              <CardContent className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <Award className="mt-0.5 size-5 text-primary" />
                  <div>
                    <p className="font-semibold">Certificate of Completion</p>
                    <p className="mt-1 text-sm text-muted-foreground">Your internship is complete. View, print or save your certificate.</p>
                  </div>
                </div>
                <Link to={`/intern/certificates/${placement.id}`}>
                  <Button type="button" variant="outline">View certificate</Button>
                </Link>
              </CardContent>
            </Card>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            If any placement information looks incorrect, contact your HR representative.
          </p>
        </>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon?: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      {Icon && <Icon className="mt-0.5 size-4 text-primary" />}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
