import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatWeek, REPORT_STATUS_LABELS } from '@/features/intern/report-weeks';
import { getMentorWeeklyReports, reviewMentorWeeklyReport } from '@/features/intern/services/weekly-reports.service';
import type { WeeklyReport } from '@/features/intern/types';

const SECTIONS: { key: 'summary' | 'learnings' | 'challenges' | 'nextWeekPlan'; label: string }[] = [
  { key: 'summary', label: 'Work this week' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'nextWeekPlan', label: 'Plan for next week' },
];

// Submitted weekly reports of one placement (drafts stay private to the intern).
export default function MentorWeeklyReports({ placementId }: { placementId: string }) {
  const reports = useQuery({
    queryKey: ['mentor', 'weekly-reports', placementId],
    queryFn: () => getMentorWeeklyReports(placementId),
    retry: false,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-semibold">Weekly reports</h3>
      {reports.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading reports…</p>
      ) : reports.isError ? (
        <p role="alert" className="text-sm text-destructive">{reports.error.message}</p>
      ) : reports.data.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <FileText className="size-4" />The intern has not submitted a weekly report yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {reports.data.map((report) => (
            <li key={report.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Week of {formatWeek(report.weekStart)}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={report.status === 'SUBMITTED' ? 'default' : 'outline'}>{REPORT_STATUS_LABELS[report.status]}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === report.id ? null : report.id)}>
                    {openId === report.id ? 'Hide' : report.status === 'SUBMITTED' ? 'Read & review' : 'Read'}
                  </Button>
                </div>
              </div>
              {openId === report.id && <ReportDetail report={report} placementId={placementId} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportDetail({ report, placementId }: { report: WeeklyReport; placementId: string }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [returning, setReturning] = useState(false);
  const review = useMutation({
    mutationFn: (decision: 'ACCEPT' | 'RETURN') => reviewMentorWeeklyReport(report.id, decision, feedback.trim() || null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mentor', 'weekly-reports', placementId] }),
        queryClient.invalidateQueries({ queryKey: ['mentor', 'placements'] }),
      ]);
    },
  });
  const feedbackMissing = returning && feedback.trim() === '';

  function decide(decision: 'ACCEPT' | 'RETURN') {
    setReturning(decision === 'RETURN');
    if (decision === 'RETURN' && feedback.trim() === '') return;
    if (!review.isPending) review.mutate(decision);
  }

  return (
    <div className="space-y-3 text-sm">
      {SECTIONS.map(({ key, label }) => report[key] && (
        <div key={key}>
          <p className="font-medium">{label}</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{report[key]}</p>
        </div>
      ))}
      {report.mentorFeedback && <p className="rounded-md bg-muted/50 p-2"><span className="font-medium">Your feedback:</span> {report.mentorFeedback}</p>}
      {report.status === 'SUBMITTED' && (
        <div className="space-y-2">
          <label className="block space-y-1.5 font-medium">Feedback
            <span className="font-normal text-muted-foreground"> (required when returning)</span>
            <Textarea rows={2} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} aria-invalid={feedbackMissing} disabled={review.isPending} />
          </label>
          {feedbackMissing && <p className="text-xs text-destructive">Explain what the intern should add or change.</p>}
          {review.isError && <p role="alert" className="text-destructive">{review.error.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => decide('RETURN')}>Return for changes</Button>
            <Button size="sm" disabled={review.isPending} onClick={() => decide('ACCEPT')}>
              {review.isPending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Accept report
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
