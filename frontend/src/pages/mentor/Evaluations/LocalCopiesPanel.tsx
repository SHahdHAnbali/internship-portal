import { useState } from 'react';
import { Copy, HardDrive, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { backupKey, listBackups, removeBackup, type EvaluationBackup } from '@/features/evaluations/local-backup';
import { formatDateTime } from '@/features/evaluations/messages';

// Unsaved text kept in this browser tab for a placement this page can no
// longer open (access ended, placement no longer assigned). Read-only: it is
// shown from the tab's own storage only, never sent to or read from the
// server; the Mentor can copy it or explicitly discard it.
export default function LocalCopiesPanel({ userId, placementId }: { userId: string; placementId: string }) {
  const [, setVersion] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(null);
  // Read on every render, so a discarded copy disappears at once.
  const copies = listBackups(userId).filter((copy) => copy.placementId === placementId);
  if (copies.length === 0) return null;

  const keyOf = (copy: EvaluationBackup) => backupKey(userId, copy.evaluationId
    ? { evaluationId: copy.evaluationId }
    : { clientDraftId: copy.clientDraftId as string });

  async function copyText(copy: EvaluationBackup) {
    try {
      await navigator.clipboard.writeText(copy.text);
      setCopied({ key: keyOf(copy), ok: true });
    } catch {
      setCopied({ key: keyOf(copy), ok: false });
    }
  }

  return (
    <section aria-label="Unsaved local text" className="space-y-3 rounded-lg border border-amber-500/40 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="size-4" />Unsaved text kept in this browser tab</h2>
      <p className="text-sm text-muted-foreground">
        You can no longer open these evaluations, so this text cannot be saved here. It exists only in this browser tab and has
        not been saved on the server. Copy it if you need it, or discard it.
      </p>
      {copies.map((copy) => {
        const key = keyOf(copy);
        return (
          <div key={key} className="space-y-2 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {copy.evaluationId ? 'Unsaved changes to an evaluation' : 'Unsaved new evaluation'} · {formatDateTime(copy.updatedAt)}
            </p>
            <textarea
              readOnly
              dir="auto"
              value={copy.text}
              aria-label="Unsaved local text"
              rows={6}
              className="w-full rounded-md border bg-muted/30 p-2 text-sm leading-6"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void copyText(copy)}>
                <Copy className="mr-2 size-4" />Copy text
              </Button>
              {copied?.key === key && (
                <span className={`text-xs ${copied.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {copied.ok ? 'Copied.' : 'Copying failed. Select the text and copy it manually.'}
                </span>
              )}
              {confirming === key ? (
                <>
                  <span className="text-sm">Discard this text? This cannot be undone.</span>
                  <Button type="button" size="sm" variant="destructive" onClick={() => {
                    removeBackup(key, 'local-copies-panel');
                    setConfirming(null);
                    setVersion((value) => value + 1);
                  }}>Yes, discard</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(key)}>
                  <Trash2 className="mr-2 size-4" />Discard
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
