import { useState } from 'react';

import { ExternalLink, FileText, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getApplicationCvLink } from '@/features/applications/services/applications.service';

// Requests a fresh, short-lived signed link each time HR opens the CV.
export default function CvAccessCard({ applicationId, hasCv }: { applicationId: string; hasCv: boolean }) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function openCv() {
    setError(null);
    setFallbackUrl(null);
    // Open the tab synchronously (inside the click) so pop-up blockers allow
    // it, then point it at the signed URL once issued.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setIsOpening(true);
    try {
      const { url } = await getApplicationCvLink(applicationId);
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else {
        setFallbackUrl(url);
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Unable to open the CV.');
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h2 className="font-semibold">CV</h2>
        </div>

        {hasCv ? (
          <>
            <Button type="button" className="w-full" onClick={() => void openCv()} disabled={isOpening}>
              {isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Open CV
            </Button>
            <p className="text-xs text-muted-foreground">Opens a secure link that expires after a few minutes.</p>
            {fallbackUrl && (
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium text-[#3F72AF] hover:underline">
                Your browser blocked the new tab — open the CV here
              </a>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No CV is stored for this application.</p>
        )}
      </CardContent>
    </Card>
  );
}
