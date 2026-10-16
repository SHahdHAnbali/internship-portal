import { CheckCircle2, CircleAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ApplicationIntakeCard from '@/features/admin/components/ApplicationIntakeCard';
import { ErrorBox, Loading } from '@/features/admin/components/QueryState';
import { useAdminOverview } from '@/features/admin/hooks/useAdmin';

// Deployment configuration status. Values and keys are never sent to the
// browser; changing them means updating the server environment and redeploying.
export default function SystemSettings() {
  const overview = useAdminOverview();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">System settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Application intake is controlled here. Below is the read-only status of the server configuration. These settings live in the server environment and change
          with a redeploy; secret values are never shown here.
        </p>
      </div>

      <ApplicationIntakeCard />

      {overview.isPending ? <Loading /> : overview.isError ? (
        <ErrorBox message={overview.error.message} onRetry={() => void overview.refetch()} />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">Configuration</CardTitle></CardHeader>
          <CardContent className="divide-y text-sm">
            <Row label="Environment" value={overview.data.system.environment} />
            <Row label="Portal address used in emails" value={overview.data.system.frontendUrl} />
            <Status label="Database and sign-in service" ok={overview.data.system.databaseConfigured} />
            <Status label="Email delivery" ok={overview.data.system.emailDeliveryConfigured} />
            <Status label="Email sender on a verified domain (EMAIL_FROM)" ok={overview.data.system.emailSenderConfigured} />
            <Status label="CV information extraction" ok={overview.data.system.cvExtractionConfigured} />
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>Review emails redirected to a development inbox</span>
              <span className={overview.data.system.reviewEmailRedirectActive ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
                {overview.data.system.reviewEmailRedirectActive ? 'Yes (development only)' : 'No'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span>{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span>{label}</span>
      {ok
        ? <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />Configured</span>
        : <span className="flex items-center gap-1.5 text-destructive"><CircleAlert className="size-4" />Not configured</span>}
    </div>
  );
}
