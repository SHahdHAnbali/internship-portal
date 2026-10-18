import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, FileText, LoaderCircle, RotateCw, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useMyInternPlacement } from '@/features/intern/hooks/useMyInternPlacement';
import { formatWeek, MY_REPORTS_KEY, REPORT_STATUS_LABELS, reportableWeeks } from '@/features/intern/report-weeks';
import {
  getMyWeeklyReports,
  saveMyWeeklyReport,
  submitMyWeeklyReport,
} from '@/features/intern/services/weekly-reports.service';
import { localIsoDate } from '@/features/intern/dates';
import type { WeeklyReport, WeeklyReportContent } from '@/features/intern/types';

const FIELDS: { key: keyof WeeklyReportContent; label: string; hint: string; required?: boolean }[] = [
  { key: 'summary', label: 'What did you work on this week?', hint: 'Required to submit.', required: true },
  { key: 'learnings', label: 'What did you learn?', hint: 'Optional.' },
  { key: 'challenges', label: 'What challenges did you face?', hint: 'Optional.' },
  { key: 'nextWeekPlan', label: 'What do you plan for next week?', hint: 'Optional.' },
];

export default function TrainingReports() {
  const placement = useMyInternPlacement();
  const reports = useQuery({ queryKey: MY_REPORTS_KEY, queryFn: getMyWeeklyReports, retry: false });
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  // A completed placement is read-only and its weeks stop at the completion date.
  const closed = placement.data?.status === 'COMPLETED';
  const lastDay = placement.data
    ? (closed && placement.data.completedAt ? placement.data.completedAt.slice(0, 10) : placement.data.endDate)
    : '';
  const weeks = placement.data ? reportableWeeks(placement.data.startDate, lastDay, localIsoDate()) : [];
  const byWeek = new Map((reports.data ?? []).map((report) => [report.weekStart, report]));
  const activeWeek = selectedWeek ?? weeks[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-5 sm:p-8">
      <header>
        <p className="text-sm font-medium text-primary">TRAINING ACTIVITY</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Weekly Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Write one report per week of your internship. Drafts stay private until you submit; your Mentor then
          accepts the report or returns it with feedback.
        </p>
      </header>

      {placement.isPending || reports.isPending ? (
        <Card><CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your reports…
        </CardContent></Card>
      ) : placement.isError || reports.isError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="flex-1 text-sm">{(placement.error ?? reports.error)?.message}</p>
          <Button variant="outline" onClick={() => { void placement.refetch(); void reports.refetch(); }}><RotateCw className="mr-2 size-4" />Retry</Button>
        </CardContent></Card>
      ) : !placement.data ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Weekly reports become available once your placement is active.
        </CardContent></Card>
      ) : weeks.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Your placement has not started yet. The first week can be reported once it begins.
        </CardContent></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Weeks</CardTitle></CardHeader>
            <CardContent className="space-y-1 p-2">
              {weeks.map((week) => {
                const report = byWeek.get(week);
                return (
                  <button
                    key={week}
                    type="button"
                    onClick={() => setSelectedWeek(week)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${week === activeWeek ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
                  >
                    <span>{formatWeek(week)}</span>
                    <span className="text-xs text-muted-foreground">{report ? shortStatus(report) : 'Not started'}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {activeWeek && <ReportEditor key={`${activeWeek}:${byWeek.get(activeWeek)?.updatedAt ?? 'new'}`} week={activeWeek} report={byWeek.get(activeWeek) ?? null} closed={closed} />}
        </div>
      )}
    </div>
  );
}

function shortStatus(report: WeeklyReport) {
  return { DRAFT: 'Draft', SUBMITTED: 'Submitted', ACCEPTED: 'Accepted', RETURNED: 'Returned' }[report.status];
}

function ReportEditor({ week, report, closed }: { week: string; report: WeeklyReport | null; closed: boolean }) {
  const queryClient = useQueryClient();
  const editable = !closed && (!report || report.status === 'DRAFT' || report.status === 'RETURNED');
  const [content, setContent] = useState<WeeklyReportContent>({
    summary: report?.summary ?? '',
    learnings: report?.learnings ?? '',
    challenges: report?.challenges ?? '',
    nextWeekPlan: report?.nextWeekPlan ?? '',
  });
  const [notice, setNotice] = useState<string | null>(null);

  const clean = (): WeeklyReportContent => ({
    summary: content.summary?.trim() || null,
    learnings: content.learnings?.trim() || null,
    challenges: content.challenges?.trim() || null,
    nextWeekPlan: content.nextWeekPlan?.trim() || null,
  });

  const save = useMutation({
    mutationFn: () => saveMyWeeklyReport(week, clean()),
    onSuccess: async () => {
      setNotice('Draft saved.');
      await queryClient.invalidateQueries({ queryKey: MY_REPORTS_KEY });
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const saved = await saveMyWeeklyReport(week, clean());
      return submitMyWeeklyReport(saved.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MY_REPORTS_KEY });
    },
  });

  const busy = save.isPending || submit.isPending;
  const error = save.error ?? submit.error;

  return (
    <Card>
      <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" />Week of {formatWeek(week)}</CardTitle>
        </div>
        <Badge variant={report?.status === 'RETURNED' ? 'destructive' : 'outline'} className="w-fit">
          {report ? REPORT_STATUS_LABELS[report.status] : 'Not started'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {report?.mentorFeedback && (
          <p className="rounded-md bg-muted/50 p-3 text-sm"><span className="font-medium">Mentor feedback:</span> {report.mentorFeedback}</p>
        )}
        {FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1.5 text-sm font-medium">
            {field.label}
            {field.required && editable && <span className="text-destructive"> *</span>}
            {editable ? (
              <Textarea
                rows={field.required ? 4 : 3}
                maxLength={5000}
                value={content[field.key] ?? ''}
                onChange={(event) => { setNotice(null); setContent({ ...content, [field.key]: event.target.value }); }}
                disabled={busy}
              />
            ) : (
              <p className="whitespace-pre-wrap font-normal text-muted-foreground">{report?.[field.key] || '—'}</p>
            )}
            {editable && <span className="block text-xs font-normal text-muted-foreground">{field.hint}</span>}
          </label>
        ))}

        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        {notice && !error && <p role="status" className="text-sm text-emerald-700">{notice}</p>}

        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => save.mutate()}>
              {save.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Save draft
            </Button>
            <Button disabled={busy || !content.summary?.trim()} onClick={() => submit.mutate()}>
              {submit.isPending ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}Submit to Mentor
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {closed && (!report || report.status === 'DRAFT' || report.status === 'RETURNED')
              ? 'Your internship has ended, so this report can no longer be changed or submitted.'
              : report?.status === 'SUBMITTED' ? 'Your Mentor has not reviewed this report yet.' : 'This report is complete.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
