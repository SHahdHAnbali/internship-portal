import { AlertCircle, ClipboardList, LoaderCircle, RotateCw, UsersRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyMentorPlacements } from '@/features/intern/services/intern-tasks.service';
import type { MentorPlacement } from '@/features/intern/services/intern-tasks.service';
import MentorPlacementTaskManager from './MentorPlacementTaskManager';
import MentorWeeklyReports from './MentorWeeklyReports';

const PLACEMENT_LABELS: Record<MentorPlacement['status'], string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function sum(placements: MentorPlacement[], key: 'openTasks' | 'awaitingReview' | 'overdueTasks' | 'reportsAwaitingReview') {
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
  const query = useQuery({ queryKey: ['mentor', 'placements'], queryFn: getMyMentorPlacements, retry: false });

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">MENTOR WORKSPACE</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Assigned Interns & Tasks</h1>
        <p className="mt-2 text-sm text-muted-foreground">Review the placements assigned to you and coordinate tasks for active interns.</p>
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
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Summary label="Active interns" value={query.data.filter((p) => p.status === 'ACTIVE').length} />
            <Summary label="Open tasks" value={sum(query.data, 'openTasks')} />
            <Summary label="Awaiting your review" value={sum(query.data, 'awaitingReview')} highlight />
            <Summary label="Overdue" value={sum(query.data, 'overdueTasks')} />
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
                  <p>
                    <span className="text-muted-foreground">Tasks:</span> {placement.openTasks} open · {placement.awaitingReview} awaiting review
                    {placement.overdueTasks > 0 && <span className="text-destructive"> · {placement.overdueTasks} overdue</span>} · {placement.acceptedTasks} accepted
                  </p>
                  <p><span className="text-muted-foreground">Weekly reports:</span> {placement.reportsAwaitingReview} awaiting review</p>
                </div>
                {placement.status === 'ACTIVE' ? (
                  <>
                    <MentorPlacementTaskManager placementId={placement.placementId} />
                    <MentorWeeklyReports placementId={placement.placementId} />
                  </>
                ) : placement.status === 'COMPLETED' ? (
                  <>
                    <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <ClipboardList className="size-4" />This placement is completed. Its tasks and weekly reports are read-only.
                    </p>
                    <MentorPlacementTaskManager placementId={placement.placementId} readOnly />
                    <MentorWeeklyReports placementId={placement.placementId} readOnly />
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    <ClipboardList className="size-4" />Task management is available while the placement is active.
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
