import type {
  ElementType,
} from 'react';

import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Loader2,
  Users,
} from 'lucide-react';

import {
  Link,
} from 'react-router-dom';

import {
  Badge,
} from '@/components/ui/badge';

import {
  Card,
  CardContent,
} from '@/components/ui/card';

import {
  useHrDashboard,
} from '@/features/hr/hooks/useHrDashboard';

import type {
  HrDashboardApplication,
  HrDashboardInterview,
  HrDashboardPipelineItem,
  TrainingDemandItem,
} from '@/features/hr/types';

const STATUS_LABELS: Record<
  string,
  string
> = {
  NEW: 'New',
  UNDER_REVIEW:
    'Under Review',
  SHORTLISTED:
    'Shortlisted',
  INTERVIEW:
    'Interview',
  OFFER:
    'Offer',
  SELECTED:
    'Selected',
  REJECTED:
    'Rejected',
};

function Dashboard() {
  const {
    data,
    isLoading,
    error,
  } = useHrDashboard();

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#3F72AF]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-slate-200 shadow-none">
          <CardContent className="py-12 text-center">
            <p className="font-medium text-[#112D4E]">
              Unable to load dashboard
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Make sure the backend server is running.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#112D4E]">
              HR Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Recruitment activity and current hiring pipeline
            </p>
          </div>

          <Link
            to="/hr/internships"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#3F72AF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#112D4E]"
          >
            <BriefcaseBusiness className="mr-2 h-4 w-4" />

            Manage Internships
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Applications"
            value={
              data.stats
                .totalApplications
            }
            icon={FileText}
          />

          <StatCard
            title="Pending Review"
            value={
              data.stats
                .pendingReview
            }
            icon={Users}
          />

          <StatCard
            title="Active Internships"
            value={
              data.stats
                .activeInternships
            }
            icon={
              BriefcaseBusiness
            }
          />

          <StatCard
            title="Upcoming Interviews"
            value={
              data.stats
                .upcomingInterviews
            }
            icon={CalendarDays}
          />
        </div>

        {/* Pipeline */}
        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold text-[#112D4E]">
                  Recruitment Pipeline
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Current application stages
                </p>
              </div>

              <Link
                to="/hr/applications"
                className="flex items-center gap-1 text-sm font-medium text-[#3F72AF] hover:text-[#112D4E]"
              >
                View applications

                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="p-5">
              {data.pipeline
                .length === 0 ? (
                <EmptyMessage message="No application data available." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  {data.pipeline.map(
                    (
                      item:
                        HrDashboardPipelineItem,
                    ) => (
                      <div
                        key={
                          item.status
                        }
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {STATUS_LABELS[
                            item.status
                          ] ??
                            item.label ??
                            item.status}
                        </p>

                        <p className="mt-3 text-2xl font-semibold text-[#112D4E]">
                          {
                            item.count
                          }
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Training Demand */}
        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[#3F72AF]" />

                  <h2 className="font-semibold text-[#112D4E]">
                    Training Demand
                  </h2>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Training areas requested by applicants
                </p>
              </div>

              <div className="text-right">
                <p className="text-xl font-semibold text-[#112D4E]">
                  {
                    data.trainingDemand
                      .totalRequests
                  }
                </p>

                <p className="text-xs text-slate-500">
                  total requests
                </p>
              </div>
            </div>

            {data.trainingDemand
              .items.length === 0 ? (
              <div className="p-6">
                <EmptyMessage message="No training demand data available." />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.trainingDemand
                  .items.map(
                    (
                      item:
                        TrainingDemandItem,
                      index,
                    ) => (
                      <div
                        key={`${item.type}-${item.name}`}
                        className="flex items-center justify-between gap-5 p-5"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#DBE2EF] text-sm font-semibold text-[#112D4E]">
                            {index + 1}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#112D4E]">
                              {
                                item.name
                              }
                            </p>

                            <div className="mt-2">
                              <Badge
                                variant={
                                  item.type ===
                                  'OTHER'
                                    ? 'secondary'
                                    : 'default'
                                }
                              >
                                {item.type ===
                                'OTHER'
                                  ? 'Candidate Request'
                                  : 'Existing Internship'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-semibold text-[#112D4E]">
                            {
                              item.count
                            }
                          </p>

                          <p className="text-xs text-slate-500">
                            {item.count ===
                            1
                              ? 'request'
                              : 'requests'}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lower Section */}
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          {/* Recent Applications */}
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-semibold text-[#112D4E]">
                    Recent Applications
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Latest submitted applications
                  </p>
                </div>

                <Link
                  to="/hr/applications"
                  className="flex items-center gap-1 text-sm font-medium text-[#3F72AF] hover:text-[#112D4E]"
                >
                  View all

                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {data
                .recentApplications
                .length === 0 ? (
                <div className="p-6">
                  <EmptyMessage message="No applications available." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.recentApplications.map(
                    (
                      application:
                        HrDashboardApplication,
                    ) => (
                      <Link
                        key={
                          application.id
                        }
                        to={`/hr/applications/${application.id}`}
                        className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#112D4E]">
                            {
                              application
                                .applicantName
                            }
                          </p>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {
                              application
                                .internshipTitle
                            }
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <Badge
                            variant="secondary"
                            className="font-normal"
                          >
                            {STATUS_LABELS[
                              application
                                .status
                            ] ??
                              application
                                .status}
                          </Badge>

                          <ArrowRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Interviews */}
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-semibold text-[#112D4E]">
                    Upcoming Interviews
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Next scheduled interviews
                  </p>
                </div>
              </div>

              {data
                .upcomingInterviewList
                .length === 0 ? (
                <div className="p-6">
                  <EmptyMessage message="No upcoming interviews." />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.upcomingInterviewList.map(
                    (
                      interview:
                        HrDashboardInterview,
                    ) => (
                      <div
                        key={
                          interview.id
                        }
                        className="p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#112D4E]">
                              {
                                interview
                                  .applicantName
                              }
                            </p>

                            <p className="mt-1 truncate text-xs text-slate-500">
                              {
                                interview
                                  .internshipTitle
                              }
                            </p>
                          </div>

                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#DBE2EF]">
                            <CalendarDays className="h-4 w-4 text-[#3F72AF]" />
                          </div>
                        </div>

                        <p className="mt-3 text-xs font-medium text-slate-600">
                          {formatInterviewDate(
                            interview
                              .scheduledAt,
                          )}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: ElementType;
}) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {title}
            </p>

            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#112D4E]">
              {value}
            </p>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DBE2EF]">
            <Icon className="h-5 w-5 text-[#3F72AF]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyMessage({
  message,
}: {
  message: string;
}) {
  return (
    <div className="py-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function formatInterviewDate(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    },
  ).format(date);
}

export default Dashboard;