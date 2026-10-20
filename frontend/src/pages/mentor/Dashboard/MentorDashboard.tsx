import { AlertCircle, ClipboardList, LoaderCircle, NotebookPen, RotateCw, UsersRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-context';
import { userScopedKey } from '@/lib/query-client';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyMentorPlacements } from '@/features/mentor/services/mentor-placements.service';
import type { MentorPlacement } from '@/features/mentor/services/mentor-placements.service';
import MentorWeeklyReports from './MentorWeeklyReports';

const PLACEMENT_LABELS: Record<MentorPlacement['status'], string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function sum(placements: MentorPlacement[], key: 'reportsAwaitingReview') {
  return placements.reduce((total, placement) => total + placement[key], 0);
}

function Summary({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight && value > 0 ? 'border-primary/40' : undefined}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function MentorDashboard() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: userScopedKey(['mentor', 'placements'], user?.id), queryFn: getMyMentorPlacements, retry: false });

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">MENTOR WORKSPACE</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Assigned Interns</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review the placements assigned to you and the weekly reports of your interns.</p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin text-primary" />Loading your assignments…</CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
          <AlertCircle className="size-6 text-destructive" /><p className="flex-1 text-sm">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </CardContent></Card>
      ) : query.data.length === 0 ? (
        <Card><CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground"><UsersRound className="size-6" /></span>
          <h2 className="mt-5 text-lg font-semibold">No interns assigned yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">When HR assigns an internship placement to you, the intern and placement details will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Summary label="Active interns" value={query.data.filter((p) => p.status === 'ACTIVE').length} />
            <Summary label="Reports to review" value={sum(query.data, 'reportsAwaitingReview')} highlight />
          </div>
          {query.data.map((placement) => (
            <Card key={placement.placementId}>
              <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <CardTitle>{placement.internName || 'Intern name unavailable'}</CardTitle>
                  <CardDescription className="mt-1">{placement.internEmail || 'Email unavailable'}</CardDescription>
                </div>
                <Badge variant={placement.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {placement.status === 'COMPLETED' ? 'Completed — read-only' : PLACEMENT_LABELS[placement.status]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">Training:</span> {placement.trainingTitle}</p>
                  <p><span className="text-muted-foreground">Company:</span> {placement.company}</p>
                  <p><span className="text-muted-foreground">Department:</span> {placement.department || 'Not specified'}</p>
                  <p><span className="text-muted-foreground">Training dates:</span> {placement.startDate} – {placement.endDate}</p>
                  <p><span className="text-muted-foreground">Weekly reports:</span> {placement.reportsAwaitingReview} awaiting review</p>
                </div>
                {(placement.status === 'ACTIVE' || placement.status === 'COMPLETED') && (
                  <Link to={`/mentor/evaluations/${placement.placementId}`}>
                    <Button type="button" variant="outline" size="sm"><NotebookPen className="mr-2 size-4" />Evaluations</Button>
                  </Link>
                )}
                {placement.status === 'ACTIVE' ? (
                  <MentorWeeklyReports placementId={placement.placementId} />
                ) : placement.status === 'COMPLETED' ? (
                  <>
                    <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <ClipboardList className="size-4" />This placement is completed. Its weekly reports are read-only.
                    </p>
                    <MentorWeeklyReports placementId={placement.placementId} readOnly />
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    <ClipboardList className="size-4" />Weekly reports are available while the placement is active.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
