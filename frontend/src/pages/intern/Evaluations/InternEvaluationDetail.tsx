import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, LoaderCircle, RotateCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { EvaluationRequestError, getMyEvaluation } from '@/features/evaluations/evaluations.service';
import { errorMessage, formatDateTime } from '@/features/evaluations/messages';
import { evaluationQueryKeys } from '@/features/evaluations/query-keys';

// One published evaluation, exactly as the Mentor published it.
export default function InternEvaluationDetail() {
  const { evaluationId = '' } = useParams();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  // On any error the error state is shown, never data kept from earlier.
  const query = useQuery({
    queryKey: evaluationQueryKeys.internEvaluation(userId, evaluationId),
    queryFn: () => getMyEvaluation(evaluationId),
    retry: false,
    enabled: userId !== '',
  });
  const evaluation = query.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <Link to="/intern/evaluations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" />All evaluations
      </Link>

      {query.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading the evaluation…</p>
      ) : query.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
            <AlertCircle className="size-6 text-destructive" />
            <p role="alert" className="flex-1 text-sm">
              {query.error instanceof EvaluationRequestError && query.error.outcome === 'not-applied'
                ? errorMessage(query.error.code)
                : errorMessage(undefined)}
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" /> Retry</Button>
          </CardContent>
        </Card>
      ) : evaluation && (
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl">Evaluation by {evaluation.authorName ?? 'your Mentor'}</CardTitle>
                    {evaluation.publishedByName && evaluation.publishedByName !== evaluation.authorName && (
                      <p className="text-sm text-muted-foreground">Published by {evaluation.publishedByName}</p>
                    )}
              {evaluation.placementStatus === 'COMPLETED' && <Badge variant="secondary">Placement completed</Badge>}
            </div>
            <CardDescription>
              {evaluation.trainingTitle} · {evaluation.company} · Published {formatDateTime(evaluation.publishedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p dir="auto" className="whitespace-pre-wrap break-words text-base leading-7">{evaluation.content}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
