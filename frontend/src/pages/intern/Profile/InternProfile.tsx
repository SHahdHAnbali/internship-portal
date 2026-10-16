import { useQuery } from '@tanstack/react-query';
import { AlertCircle, LoaderCircle, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ApplicantDataView from '@/features/applications/components/ApplicantDataView';
import { getInternProfile } from '@/features/intern/services/weekly-reports.service';

// Read-only: the profile the intern submitted with their application.
export default function InternProfile() {
  const query = useQuery({ queryKey: ['intern', 'profile'], queryFn: getInternProfile, retry: false });

  return (
    <div className="mx-auto max-w-5xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">ACCOUNT</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">My Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The details from your application. To correct anything, contact your HR representative.
        </p>
      </header>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your profile…
        </CardContent></Card>
      ) : query.isError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="flex-1 text-sm">{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" />Retry</Button>
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
          <CardContent>
            <ApplicantDataView
              data={{
                fullName: query.data.fullName,
                email: query.data.email,
                phone: query.data.phone,
                location: query.data.location,
                summary: query.data.profileData?.summary ?? null,
                education: query.data.profileData?.education ?? [],
                experience: query.data.profileData?.experience ?? [],
                skills: query.data.profileData?.skills ?? [],
                languages: query.data.profileData?.languages ?? [],
                certifications: query.data.profileData?.certifications ?? [],
                links: query.data.profileData?.links ?? { linkedin: null, github: null, portfolio: null },
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
