import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { CvCheckView } from '../cv-check';

export default function CvCheckNotice({
  view,
  onRetry,
  retrying = false,
}: {
  view: CvCheckView;
  onRetry: () => void;
  retrying?: boolean;
}) {
  if (view.status === 'idle') {
    return null;
  }

  if (view.status === 'checking') {
    return (
      <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking this CV against previous uploads...
      </p>
    );
  }

  if (view.status === 'failed') {
    return (
      <div role="alert" className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          We could not check this CV against previous uploads. Check your connection and try again before submitting.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Try again
        </Button>
      </div>
    );
  }

  if (view.status === 'unavailable') {
    return (
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        This CV cannot be checked in advance. It will be checked when you submit.
      </p>
    );
  }

  if (view.duplicate) {
    return (
      <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">This CV has already been submitted.</p>
          <p className="mt-1">
            This CV file was already submitted with an application, so it cannot be used for another application. Please upload a different CV.
          </p>
        </div>
      </div>
    );
  }

  if (view.previouslyUploaded) {
    return (
      <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">This CV matches a file that was uploaded before.</p>
          <p className="mt-1">
            An identical CV file has already been uploaded to the portal, possibly for another training. If it is your own earlier upload, you can continue. Please make sure you are submitting your own CV.
          </p>
        </div>
      </div>
    );
  }

  return (
    <p role="status" className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
      <CheckCircle2 className="h-4 w-4" />
      No previous upload of this CV was found.
    </p>
  );
}
