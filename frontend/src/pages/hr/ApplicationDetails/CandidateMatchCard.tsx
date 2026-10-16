import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getApplicationMatch,
  runApplicationMatch,
} from '@/features/applications/services/applications.service';

// Advisory comparison with the internship requirements. It never changes the
// application's status or ordering; HR makes every decision.
export default function CandidateMatchCard({
  applicationId,
  available,
}: {
  applicationId: string;
  // Matching needs a listed internship with defined requirements.
  available: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['hr', 'application-match', applicationId];
  const match = useQuery({
    queryKey,
    queryFn: () => getApplicationMatch(applicationId),
    enabled: available,
    retry: false,
  });
  const run = useMutation({
    mutationFn: () => runApplicationMatch(applicationId),
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
  });

  const data = match.data ?? null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#3F72AF]" />
              <h2 className="text-xl font-semibold">Requirements comparison</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Advisory</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              An automated comparison of the submitted data with this internship’s requirements. It does not make or rank decisions.
            </p>
          </div>

          {available && (
            <Button type="button" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {data ? 'Recalculate' : 'Run comparison'}
            </Button>
          )}
        </div>

        {!available ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Comparison is only available for applications to a listed internship, because “Other” requests have no defined requirements.
          </p>
        ) : (
          <>
            {(run.isError || match.isError) && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {(run.error ?? match.error)?.message}
              </p>
            )}

            {match.isPending ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : !data ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="text-sm font-medium">No comparison yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Run the comparison to see how the submitted data meets the requirements.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-5 rounded-xl border bg-slate-50 p-5 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 border-[#DBE2EF] bg-white">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-[#112D4E]">{data.overallScore}%</p>
                      <p className="text-[11px] text-muted-foreground">overall</p>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Indicative only. Review the CV and the applicant’s data before deciding.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <ScoreCard label="Skills" score={data.skillsScore} />
                  <ScoreCard label="Education" score={data.educationScore} />
                  <ScoreCard label="Experience" score={data.experienceScore} />
                  <ScoreCard label="Languages" score={data.languagesScore} />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <MatchList title="Requirements met" items={data.matchedRequirements} emptyText="None identified." />
                  <MatchList title="Requirements not met" items={data.missingRequirements} emptyText="None identified." />
                  <MatchList title="Strengths" items={data.strengths} emptyText="None identified." />
                  <MatchList title="Gaps" items={data.gaps} emptyText="None identified." />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
  const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#112D4E]">{value === null ? '—' : `${value}%`}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#3F72AF]" style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function MatchList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-xl border p-5">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3F72AF]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
