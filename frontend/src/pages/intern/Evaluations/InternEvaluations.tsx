import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ClipboardCheck, LoaderCircle, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { EvaluationRequestError, listMyEvaluations } from '@/features/evaluations/evaluations.service';
import { errorMessage, formatDateTime } from '@/features/evaluations/messages';
import { evaluationQueryKeys } from '@/features/evaluations/query-keys';
import type { InternEvaluation } from '@/features/evaluations/types';

const EXCERPT_CODE_POINTS = 280;

function excerpt(text: string): string {
  const points = Array.from(text.trim());
  return points.length > EXCERPT_CODE_POINTS ? `${points.slice(0, EXCERPT_CODE_POINTS).join('')}…` : points.join('');
}

// Published evaluations of the intern's own placements. Only the published
// version is ever returned by the server; drafts are never shown here.
export default function InternEvaluations() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  // On any error the error state is shown, never data kept from earlier.
  const query = useQuery({
    queryKey: evaluationQueryKeys.internEvaluations(userId),
    queryFn: listMyEvaluations,
    retry: false,
    enabled: userId !== '',
  });

  const groups = new Map<string, InternEvaluation[]>();
  for (const evaluation of query.data ?? []) {
    groups.set(evaluation.placementId, [...(groups.get(evaluation.placementId) ?? []), evaluation]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">MENTOR FEEDBACK</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Evaluations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Evaluations your Mentor has published for your internship.</p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your evaluations…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
            <AlertCircle className="size-6 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load your evaluations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.error instanceof EvaluationRequestError && query.error.outcome === 'not-applied'
                  ? errorMessage(query.error.code)
                  : errorMessage(undefined)}
              </p>
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" /> Retry</Button>
          </CardContent>
        </Card>
      ) : groups.size === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ClipboardCheck className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">No evaluations yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              When your Mentor publishes an evaluation, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        [...groups.values()].map((evaluations) => (
          <section key={evaluations[0].placementId} className="space-y-3" aria-label={`${evaluations[0].trainingTitle} evaluations`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{evaluations[0].trainingTitle}</h2>
              <span className="text-sm text-muted-foreground">· {evaluations[0].company}</span>
              {evaluations[0].placementStatus === 'COMPLETED' && <Badge variant="secondary">Placement completed</Badge>}
            </div>
            <div className="grid gap-4">
              {evaluations.map((evaluation) => (
                <Card key={evaluation.id}>
                  <CardHeader>
                    <CardTitle className="text-base">Evaluation by {evaluation.authorName ?? 'your Mentor'}</CardTitle>
                    {evaluation.publishedByName && evaluation.publishedByName !== evaluation.authorName && (
                      <p className="text-sm text-muted-foreground">Published by {evaluation.publishedByName}</p>
                    )}
                    <CardDescription>Published {formatDateTime(evaluation.publishedAt)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p dir="auto" className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{excerpt(evaluation.content)}</p>
                    <Link to={`/intern/evaluations/${evaluation.id}`}>
                      <Button type="button" variant="outline" size="sm">Read evaluation</Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
