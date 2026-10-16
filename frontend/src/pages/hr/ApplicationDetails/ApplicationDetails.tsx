import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  Loader2,
  RotateCw,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getApplicationDetails } from '@/features/applications/services/applications.service';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_STYLES,
} from '@/features/applications/status';

import CandidateMatchCard from './CandidateMatchCard';
import CvAccessCard from './CvAccessCard';
import DataComparison from './DataComparison';
import PlacementSection from './PlacementSection';
import SelectionReleaseCard from './SelectionReleaseCard';
import StatusDecisionPanel from './StatusDecisionPanel';
import { applicationDetailsKey } from '@/features/applications/hooks/query-keys';
import StatusHistory from './StatusHistory';

export default function ApplicationDetails() {
  const { id = '' } = useParams<{ id: string }>();

  const details = useQuery({
    queryKey: applicationDetailsKey(id),
    queryFn: () => getApplicationDetails(id),
    enabled: Boolean(id),
    retry: false,
  });

  if (details.isPending) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (details.isError) {
    return (
      <div className="space-y-4 p-6">
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="flex-1 text-sm">{details.error.message}</p>
            <Button variant="outline" onClick={() => void details.refetch()} className="gap-2">
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const application = details.data;
  const trainingTitle = application.internship?.title ?? application.requestedTraining ?? '—';

  return (
    <main className="space-y-8 p-6">
      <div>
        <BackLink />
        <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold">
              {application.applicant?.fullName ?? application.reviewedData?.fullName ?? 'Application'}
            </h1>
            <p className="mt-2 text-muted-foreground">{trainingTitle}</p>
          </div>
          <Badge variant="outline" className={`w-fit text-sm ${APPLICATION_STATUS_STYLES[application.status]}`}>
            {APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
        </div>
      </div>

      {application.status === 'SELECTED' && <PlacementSection application={application} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <DataComparison
            reviewed={application.reviewedData}
            original={application.originalExtraction}
            fallbackName={application.applicant?.fullName}
            fallbackEmail={application.applicant?.email}
          />
          <CandidateMatchCard applicationId={application.id} available={Boolean(application.internship)} />
        </div>

        <div className="space-y-6">
          <StatusDecisionPanel application={application} />
          <SelectionReleaseCard application={application} />

          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center gap-3">
                <BriefcaseBusiness className="h-5 w-5" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    {application.internship ? 'Internship' : 'Requested training (Other)'}
                  </p>
                  <p className="font-medium">{trainingTitle}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="mt-1 text-sm">{formatDateTime(application.submittedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CV uploaded</p>
                <p className="mt-1 text-sm">{formatDateTime(application.appliedAt)}</p>
              </div>
            </CardContent>
          </Card>

          <CvAccessCard applicationId={application.id} hasCv={application.hasCv} />
          <StatusHistory events={application.statusHistory} />
        </div>
      </div>
    </main>
  );
}

function BackLink() {
  return (
    <Link to="/hr/applications" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Applications
    </Link>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
