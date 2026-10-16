import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  RotateCw,
  Search,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import { useApplications } from '@/features/applications/hooks/useApplications';
import { exportApplications } from '@/features/applications/services/applications.service';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_STYLES,
  SUBMITTED_STATUSES,
} from '@/features/applications/status';
import type {
  ApplicationListParams,
  ApplicationSortField,
  ApplicationStatus,
} from '@/features/applications/types';
import { useDebounce } from '@/hooks/useDebounce';

const SORT_OPTIONS: Array<{ value: `${ApplicationSortField}:${'asc' | 'desc'}`; label: string }> = [
  { value: 'submittedAt:desc', label: 'Newest submissions first' },
  { value: 'submittedAt:asc', label: 'Oldest submissions first' },
  { value: 'applicantName:asc', label: 'Applicant name A–Z' },
  { value: 'applicantName:desc', label: 'Applicant name Z–A' },
  { value: 'status:asc', label: 'Status (pipeline order)' },
  { value: 'status:desc', label: 'Status (reverse order)' },
];

const selectClass =
  'h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-[#3F72AF]/40';

function Applications() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('submittedAt:desc');
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const [sortField, sortOrder] = sort.split(':') as [ApplicationSortField, 'asc' | 'desc'];

  const params: ApplicationListParams = {
    status: status || undefined,
    search: debouncedSearch.trim() || undefined,
    sort: sortField,
    order: sortOrder,
  };

  const { data: applications = [], isPending, isError, error, refetch, isFetching } =
    useApplications(params);

  const hasFilters = Boolean(params.status || params.search);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      const { blob, filename } = await exportApplications(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export applications.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#112D4E]">
            Applications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review and manage submitted internship applications.
          </p>
        </div>

        {/* Search, filter and sort */}
        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, email or training…"
                  aria-label="Search applications"
                  maxLength={200}
                  className="h-10 border-slate-200 bg-white pl-9"
                />
              </div>

              <select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ApplicationStatus | '')}
                className={selectClass}
              >
                <option value="">All statuses</option>
                {SUBMITTED_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {APPLICATION_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Sort applications"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className={selectClass}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSearch('');
                    setStatus('');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results header */}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[#112D4E]">
              {isPending ? 'Loading…' : `${applications.length} ${applications.length === 1 ? 'application' : 'applications'}`}
              {isFetching && !isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hasFilters ? 'Matching the current search and filter' : 'All submitted applications'}
            </p>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              disabled={isPending || isError || applications.length === 0 || isExporting}
              className="gap-2"
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
            <p className="text-xs text-slate-500">Exports the rows shown, in this order.</p>
          </div>
        </div>

        {exportError && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {exportError}
          </div>
        )}

        <Card className="overflow-hidden border-slate-200 shadow-none">
          <CardContent className="p-0">
            {isPending ? (
              <div className="flex min-h-[340px] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-[#3F72AF]" />
              </div>
            ) : isError ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <p className="font-medium text-[#112D4E]">Unable to load applications</p>
                <p className="text-sm text-slate-500">{error.message}</p>
                <Button variant="outline" onClick={() => void refetch()} className="gap-2">
                  <RotateCw className="h-4 w-4" /> Retry
                </Button>
              </div>
            ) : applications.length === 0 ? (
              hasFilters ? <NoSearchResults /> : <ApplicationsEmptyState />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Candidate</th>
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Training</th>
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Submitted</th>
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">CV</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((application) => (
                      <tr
                        key={application.id}
                        className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-[#112D4E]">{application.applicantName}</p>
                          <p className="mt-1 text-xs text-slate-500">{application.applicantEmail}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{application.internshipTitle}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {application.submittedAt ? formatDateTime(application.submittedAt) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={APPLICATION_STATUS_STYLES[application.status]}>
                            {APPLICATION_STATUS_LABELS[application.status]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          {application.hasCv ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                              <FileText className="h-3.5 w-3.5" /> On file
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Not available</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/hr/applications/${application.id}`}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApplicationsEmptyState() {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DBE2EF]">
        <FileText className="h-5 w-5 text-[#3F72AF]" />
      </div>
      <h2 className="mt-4 font-semibold text-[#112D4E]">No applications yet</h2>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
        Applications appear here once candidates review and submit them.
      </p>
    </div>
  );
}

function NoSearchResults() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
      <Search className="h-5 w-5 text-slate-400" />
      <h2 className="mt-3 font-medium text-[#112D4E]">No applications found</h2>
      <p className="mt-1 text-sm text-slate-500">Try a different search or status.</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default Applications;
