import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, LoaderCircle, RotateCw, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getInternProgress, type InternProgress } from '@/features/hr/services/intern-progress.service';

const STATUS_LABELS: Record<InternProgress['status'], string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
};

// HR follow-up of placements: Mentor coverage and weekly reports, as counts.
// Report content stays with intern and Mentor.
export default function InternProgressPage() {
  const query = useQuery({ queryKey: ['hr', 'intern-progress'], queryFn: getInternProgress, retry: false });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-[#112D4E]">Intern Progress</h1>
        <p className="mt-1 text-sm text-slate-500">
          Follow up scheduled and active placements: Mentor assignment and weekly reports.
          Open a placement to change it.
        </p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> Loading progress…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="flex-1 text-sm">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </CardContent></Card>
      ) : query.data.length === 0 ? (
        <Card><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
          <UsersRound className="size-8" />
          No scheduled or active placements yet. Placements are created from a selected application.
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Intern</th>
                  <th className="px-4 py-3 font-medium">Placement</th>
                  <th className="px-4 py-3 font-medium">Mentor</th>
                  <th className="px-4 py-3 font-medium">Weekly reports</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((row) => (
                  <tr key={row.placementId} className="border-b align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/hr/applications/${row.applicationId}`} className="font-medium text-[#3F72AF] hover:underline">
                        {row.internName ?? 'Unnamed intern'}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.internEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{row.trainingTitle}</p>
                      <p className="text-xs text-muted-foreground">{row.company}{row.department ? ` · ${row.department}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{row.startDate} – {row.endDate}</p>
                      <Badge variant={row.status === 'ACTIVE' ? 'default' : 'outline'} className="mt-1">{STATUS_LABELS[row.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {row.mentorName ? (
                        <>
                          <p>{row.mentorName}</p>
                          {row.mentorActive === false && <p className="text-xs text-destructive">Account deactivated</p>}
                        </>
                      ) : (
                        <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" />No Mentor</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.reports.expected === 0 ? <span className="text-muted-foreground">Not started</span> : (
                        <>
                          <p className={row.reports.submitted < row.reports.expected ? 'text-amber-700 dark:text-amber-400' : undefined}>
                            {row.reports.submitted} of {row.reports.expected} weeks submitted
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.reports.accepted} accepted{row.reports.returned > 0 ? ` · ${row.reports.returned} returned` : ''}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(row.lastActivityAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
