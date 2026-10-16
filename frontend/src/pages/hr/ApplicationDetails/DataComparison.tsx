import { useState } from 'react';

import { GitCompare, Info } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { diffApplicantData } from '@/features/applications/data-diff';
import type { ExtractedCvData } from '@/features/applications/types';

import ApplicantDataView from '@/features/applications/components/ApplicantDataView';

type View = 'reviewed' | 'original';

// Shows the applicant-reviewed data by default, with the original AI
// extraction and a list of the applicant's corrections for comparison.
export default function DataComparison({
  reviewed,
  original,
  fallbackName,
  fallbackEmail,
}: {
  reviewed: ExtractedCvData | null;
  original: ExtractedCvData | null;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
}) {
  const [view, setView] = useState<View>('reviewed');
  const changes = reviewed && original ? diffApplicantData(original, reviewed) : null;

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-xl font-semibold">Applicant information</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === 'reviewed'
                ? 'As reviewed, corrected and submitted by the applicant.'
                : 'As originally extracted from the CV, before the applicant’s review.'}
            </p>
          </div>

          <div role="tablist" aria-label="Data version" className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-1">
            {(['reviewed', 'original'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                disabled={option === 'original' && !original}
                onClick={() => setView(option)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  view === option ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option === 'reviewed' ? 'Submitted' : 'Original extraction'}
              </button>
            ))}
          </div>
        </div>

        {!original ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            The original extraction was not retained for this application (it was submitted before originals were kept), so only the submitted data can be shown.
          </p>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <GitCompare className="h-4 w-4" />
              {changes && changes.length > 0
                ? `The applicant changed ${changes.length} ${changes.length === 1 ? 'field' : 'fields'} during review`
                : 'The applicant submitted the extracted data without changes'}
            </p>
            {changes && changes.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {changes.map((change) => (
                  <li key={change.field} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{change.label}:</span>
                    <span className="text-muted-foreground">{change.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ApplicantDataView
          data={view === 'original' ? original : reviewed}
          fallbackName={fallbackName}
          fallbackEmail={fallbackEmail}
        />
      </CardContent>
    </Card>
  );
}
