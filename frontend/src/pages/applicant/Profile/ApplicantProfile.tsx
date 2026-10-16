import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  Pencil,
  RotateCw,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import ApplicantDataView from '@/features/applications/components/ApplicantDataView';
import {
  getApplicantProfile,
  updateApplicantProfile,
} from '@/features/applications/services/applicant-profile.service';
import {
  APPLICANT_STATUS_MESSAGES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_STYLES,
} from '@/features/applications/status';
import type {
  ApplicantProfile as ApplicantProfileType,
  ApplicantProfileApplication,
  ApplicantProfileUpdate,
} from '@/features/applications/types';

import ApplicantProfileForm from './ApplicantProfileForm';

const profileKey = ['applicant', 'me'] as const;

export default function ApplicantProfile() {
  const { signOut, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const profileQuery = useQuery({ queryKey: profileKey, queryFn: getApplicantProfile, retry: false });

  const save = useMutation({
    mutationFn: (update: ApplicantProfileUpdate) => updateApplicantProfile(update),
    onSuccess: (updated) => {
      queryClient.setQueryData<ApplicantProfileType>(profileKey, updated);
      setEditing(false);
      setSavedNotice(true);
    },
  });

  // Once HR activates a placement the account is no longer an applicant
  // account and the API refuses this page; reloading the role lets the route
  // guard move the user to their new portal.
  const loadFailed = profileQuery.isError;
  useEffect(() => {
    if (loadFailed) {
      void refreshProfile();
    }
  }, [loadFailed, refreshProfile]);

  if (profileQuery.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  if (profileQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
        <Card className="w-full max-w-lg">
          <CardContent className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Unable to load your profile</h1>
            <p className="mt-3 text-sm text-muted-foreground">{profileQuery.error.message}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={() => void profileQuery.refetch()} className="gap-2">
                <RotateCw className="h-4 w-4" /> Try again
              </Button>
              <Button onClick={() => void signOut()}>Sign out</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const profile = profileQuery.data;
  const applications = profile.applications;
  const decided = applications.filter((a) => a.status === 'SELECTED' || a.status === 'REJECTED').length;

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div>
            <p className="text-sm font-medium text-primary">Applicant portal</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {profile.fullName}</h1>
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Applications" value={applications.length} />
          <Stat label="In progress" value={applications.length - decided} />
          <Stat label="Decided" value={decided} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>My applications</CardTitle>
            <Link to="/apply">
              <Button variant="outline" size="sm">Apply for another training</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no submitted applications yet.</p>
            ) : (
              <ul className="space-y-4">
                {applications.map((application) => (
                  <ApplicationItem key={application.id} application={application} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>My profile</CardTitle>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => { save.reset(); setSavedNotice(false); setEditing(true); }} className="gap-1.5">
                <Pencil className="h-4 w-4" /> Edit profile
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {savedNotice && !editing && (
              <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Your profile was saved.</p>
            )}
            {editing ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Changes update your profile. Applications you already submitted keep the information you submitted with them.
                </p>
                <ApplicantProfileForm
                  profile={profile}
                  onSave={(update) => save.mutate(update)}
                  onCancel={() => setEditing(false)}
                  isSaving={save.isPending}
                  saveError={save.isError ? save.error.message : null}
                />
              </>
            ) : (
              <ApplicantDataView
                data={{
                  fullName: profile.fullName,
                  email: profile.email,
                  phone: profile.phone,
                  location: profile.location,
                  summary: profile.profileData?.summary ?? null,
                  education: profile.profileData?.education ?? [],
                  experience: profile.profileData?.experience ?? [],
                  skills: profile.profileData?.skills ?? [],
                  languages: profile.profileData?.languages ?? [],
                  certifications: profile.profileData?.certifications ?? [],
                  links: profile.profileData?.links ?? { linkedin: null, github: null, portfolio: null },
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ApplicationItem({ application }: { application: ApplicantProfileApplication }) {
  const Icon = application.status === 'SELECTED' ? CheckCircle2 : application.status === 'REJECTED' ? XCircle : Clock;
  return (
    <li className="space-y-3 rounded-xl border p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">
              {application.trainingTitle}
              {application.trainingType === 'OTHER' && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Requested training</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitted {formatDate(application.submittedAt ?? application.appliedAt)}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`w-fit ${APPLICATION_STATUS_STYLES[application.status]}`}>
          {APPLICATION_STATUS_LABELS[application.status]}
        </Badge>
      </div>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" /> {APPLICANT_STATUS_MESSAGES[application.status]}
      </p>

      {application.status === 'REJECTED' && application.rejectionReason && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">Reason</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{application.rejectionReason}</p>
        </div>
      )}

      {application.status === 'SELECTED' && application.placement && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
          <p className="font-medium">
            {application.placement.status === 'SCHEDULED' ? 'Your internship is scheduled' : 'Your internship'}
          </p>
          <p className="mt-1 text-muted-foreground">
            {application.placement.company}
            {application.placement.department ? ` · ${application.placement.department}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            {formatDate(application.placement.startDate)} – {formatDate(application.placement.endDate)}
          </p>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}
