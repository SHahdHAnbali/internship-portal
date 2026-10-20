import { useQuery } from '@tanstack/react-query';
import { AlertCircle, HardDrive, LoaderCircle, NotebookPen, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { listBackups } from '@/features/evaluations/local-backup';
import { evaluationQueryKeys } from '@/features/evaluations/query-keys';
import { getMyMentorPlacements } from '@/features/mentor/services/mentor-placements.service';

// Placements the Mentor can open evaluations for (ACTIVE: write; COMPLETED: read).
export default function MentorEvaluations() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const query = useQuery({
    queryKey: evaluationQueryKeys.mentorPlacements(userId),
    queryFn: getMyMentorPlacements,
    retry: false,
    enabled: userId !== '',
  });
  const placements = (query.data ?? []).filter((p) => p.status === 'ACTIVE' || p.status === 'COMPLETED');
  // Placements with unsaved evaluation text kept in this tab (see local-backup.ts).
  const withLocalText = new Set(user ? listBackups(user.id).map((backup) => backup.placementId) : []);
  // Placements with local text that are no longer in this Mentor's list
  // (reassigned or no longer accessible): their text can still be copied there.
  const unreachable = query.isSuccess
    ? [...withLocalText].filter((id) => !placements.some((placement) => placement.placementId === id))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">MENTOR WORKSPACE</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Evaluations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Write evaluations of your interns in your own words. Drafts stay private; the intern sees an evaluation only after you publish it.
        </p>
      </header>

      {query.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your placements…</p>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <AlertCircle className="size-4" />{query.error.message}
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </div>
      ) : placements.length === 0 ? (
        <Card><CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <NotebookPen className="size-6" />No active or completed placements are assigned to you.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {placements.map((placement) => (
            <Card key={placement.placementId}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>{placement.internName || 'Intern name unavailable'}</CardTitle>
                  <CardDescription className="mt-1">{placement.trainingTitle} · {placement.company}</CardDescription>
                </div>
                <Badge variant={placement.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {placement.status === 'ACTIVE' ? 'Active' : 'Completed — read-only'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {withLocalText.has(placement.placementId) && (
                  <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                    <HardDrive className="size-4" />Unsaved evaluation text is kept in this browser tab (not saved on the server).
                  </p>
                )}
                <Link to={`/mentor/evaluations/${placement.placementId}`}>
                  <Button type="button" variant="outline"><NotebookPen className="mr-2 size-4" />Open evaluations</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {unreachable.length > 0 && (
        <section aria-label="Unsaved text for other placements" className="space-y-2 rounded-lg border border-amber-500/40 p-4 text-sm">
          <h2 className="flex items-center gap-2 font-semibold"><HardDrive className="size-4" />Unsaved text for placements you can no longer open</h2>
          <p className="text-muted-foreground">
            This text exists only in this browser tab and has not been saved on the server. Open it to copy or discard it.
          </p>
          <ul className="space-y-1">
            {unreachable.map((id) => (
              <li key={id}>
                <Link className="text-primary hover:underline" to={`/mentor/evaluations/${id}`}>View the unsaved text</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
