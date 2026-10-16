import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function Loading() {
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertCircle className="size-4" />{message}
      {onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}
