import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Award, CalendarDays, LoaderCircle, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { listMyCertificates } from '@/features/certificates/certificates.service';
import { certificateErrorMessage, formatCompletionDate } from '@/features/certificates/messages';
import { certificateQueryKeys } from '@/features/certificates/query-keys';

// The intern's own current certificates of completion, one per completed
// placement. Certificates are issued when HR completes the internship.
export default function InternCertificates() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  // On any error the error state is shown, never data kept from earlier.
  const query = useQuery({
    queryKey: certificateQueryKeys.internCertificates(userId),
    queryFn: listMyCertificates,
    retry: false,
    enabled: userId !== '',
  });

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">COMPLETION</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Certificates</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your certificates of completion. You can print them or save them as PDF.</p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your certificates…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
            <AlertCircle className="size-6 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load your certificates</p>
              <p className="mt-1 text-sm text-muted-foreground">{certificateErrorMessage(query.error)}</p>
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" /> Retry</Button>
          </CardContent>
        </Card>
      ) : query.data.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Award className="size-6" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">No certificates yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Your certificate of completion will appear here once HR has officially completed your internship.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {query.data.map((certificate) => (
            <Card key={certificate.placementId}>
              <CardHeader>
                <CardDescription className="flex items-center gap-2"><Award className="size-4 text-primary" /> {certificate.certificateTitle}</CardDescription>
                <CardTitle className="text-lg break-words" dir="auto">{certificate.trainingTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="size-4" /> Completed on {formatCompletionDate(certificate.completionDate)}
                </p>
                <Link to={`/intern/certificates/${certificate.placementId}`}>
                  <Button type="button" variant="outline" size="sm">View certificate</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
