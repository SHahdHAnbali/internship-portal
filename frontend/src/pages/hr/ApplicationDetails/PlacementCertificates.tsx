import { useState, type ReactNode } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { applicationPlacementKey } from '@/features/applications/hooks/query-keys';
import { useAuth } from '@/features/auth/auth-context';
import {
  CertificateRequestError,
  listPlacementCertificates,
  reissueCertificate,
} from '@/features/certificates/certificates.service';
import {
  ISSUE_KIND_LABELS,
  REISSUE_OUTCOME_UNKNOWN_MESSAGE,
  REISSUE_REASON_MAX_LENGTH,
  STATUS_LABELS,
  certificateErrorMessage,
  countCharacters,
  errorMessage,
  formatCompletionDate,
  formatDateTime,
  formatDurationWords,
  reissueReasonProblem,
} from '@/features/certificates/messages';
import { certificateQueryKeys } from '@/features/certificates/query-keys';
import type { HrCertificate } from '@/features/certificates/types';

// HR only: the certificate of a completed placement and its reissue history.
// The certificate is issued by the database when HR completes the placement;
// there is no separate issue action. A reissue supersedes the current record
// and creates a new one from the current name and training title.
export default function PlacementCertificates({ applicationId, placementId }: { applicationId: string; placementId: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const queryClient = useQueryClient();
  const queryKey = certificateQueryKeys.hrPlacementCertificates(userId, placementId);
  const query = useQuery({
    queryKey,
    queryFn: () => listPlacementCertificates(placementId),
    retry: false,
    enabled: userId !== '',
  });

  const [target, setTarget] = useState<HrCertificate | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: applicationPlacementKey(applicationId) }),
    ]);
  }

  const reissue = useMutation({
    mutationFn: ({ certificateId, text }: { certificateId: string; text: string }) => reissueCertificate(certificateId, text),
    retry: false,
    onSuccess: async () => {
      setTarget(null);
      setNotice('Certificate reissued. The intern now sees the new version.');
      await refresh();
    },
    onError: async (error) => {
      // The list may have changed (replaced by someone else, or a reissue
      // whose outcome is unknown): reload it so HR acts on current data.
      if (!(error instanceof CertificateRequestError) || error.outcome === 'unknown' || error.code === 'CERTIFICATE_NOT_CURRENT') {
        await refresh();
      }
    },
  });

  function openReissue(certificate: HrCertificate) {
    reissue.reset();
    setReason('');
    setTouched(false);
    setNotice(null);
    setTarget(certificate);
  }

  const problem = reissueReasonProblem(reason);
  const length = countCharacters(reason.trim());
  const records = query.data ?? [];
  const current = records.find((record) => record.status === 'ISSUED') ?? null;
  const superseded = records.filter((record) => record.status === 'SUPERSEDED').reverse();

  return (
    <section aria-labelledby="placement-certificate-heading" className="space-y-3 rounded-xl border p-5">
      <div className="flex items-start gap-3">
        <Award className="mt-0.5 size-5 text-primary" />
        <div>
          <h3 id="placement-certificate-heading" className="font-semibold">Certificate of completion</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Issued when the placement was completed. Reissue it to correct the intern’s name or the training title;
            the earlier version is kept here. Reissue reasons are visible to HR only.
          </p>
        </div>
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-emerald-600/20 bg-emerald-600/5 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" /> {notice}
        </p>
      )}

      {query.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading certificate…</p>
      ) : query.isError ? (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {certificateErrorMessage(query.error)}
          <Button type="button" variant="outline" className="ml-3" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : !current ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No current certificate was found for this placement.</p>
      ) : (
        <>
          <CertificateRecord certificate={current}>
            <Button type="button" variant="outline" size="sm" onClick={() => openReissue(current)}>Reissue certificate</Button>
          </CertificateRecord>
          <MissingDetailsNotice certificate={current} />
          {superseded.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Earlier versions</h4>
              <ul className="space-y-2">
                {superseded.map((record) => (
                  <li key={record.id}><CertificateRecord certificate={record} /></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Dialog open={target !== null} onOpenChange={(isOpen) => { if (!isOpen && !reissue.isPending) setTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          {target && (
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setTouched(true);
                if (problem || reissue.isPending) return;
                reissue.mutate({ certificateId: target.id, text: reason.trim() });
              }}
            >
              <DialogHeader>
                <DialogTitle>Reissue this certificate?</DialogTitle>
                <DialogDescription>
                  A new certificate is created from the current records: the intern’s name, the internship’s title, the
                  HR user who completed the placement and its Mentor. The start and completion dates, and so the duration,
                  stay the same. The current version is kept as superseded and the intern sees only the new one.
                </DialogDescription>
              </DialogHeader>
              <label className="block space-y-1.5 text-sm font-medium">
                Reason <span className="text-destructive">*</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  aria-invalid={touched && problem !== null}
                  aria-describedby="reissue-reason-help"
                  placeholder="Why is the certificate reissued? Visible to HR only."
                  disabled={reissue.isPending}
                />
                <span id="reissue-reason-help" className="flex justify-between gap-3 text-xs font-normal">
                  <span className="text-destructive">{touched && problem ? errorMessage(problem) : ''}</span>
                  <span className={length > REISSUE_REASON_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}>
                    {length.toLocaleString('en-US')} / {REISSUE_REASON_MAX_LENGTH.toLocaleString('en-US')}
                  </span>
                </span>
              </label>
              {reissue.isError && (
                <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {reissue.error instanceof CertificateRequestError && reissue.error.outcome === 'not-applied'
                    ? errorMessage(reissue.error.code)
                    : REISSUE_OUTCOME_UNKNOWN_MESSAGE}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={reissue.isPending}>Back</Button>
                <Button type="submit" disabled={reissue.isPending}>
                  {reissue.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {reissue.isPending ? 'Reissuing…' : 'Reissue certificate'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// HR only: what the current certificate could not state, and what to do.
function MissingDetailsNotice({ certificate }: { certificate: HrCertificate }) {
  const notes: string[] = [];
  if (certificate.hrSignatoryName === null) {
    notes.push('The HR user who completed this placement could not be determined (no recorded completion or no name), so the HR signature line has no printed name.');
  }
  if (certificate.mentorSignatoryName === null) {
    notes.push('This placement has no Mentor with a recorded name, so the Mentor signature line has no printed name.');
  }
  if (certificate.duration === null) {
    notes.push('The duration could not be determined from the placement’s start and completion dates, so the certificate does not state it.');
  }
  if (notes.length === 0) return null;
  return (
    <ul role="note" aria-label="Missing certificate details" className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {notes.map((note) => <li key={note}>{note}</li>)}
    </ul>
  );
}

function CertificateRecord({ certificate, children }: { certificate: HrCertificate; children?: ReactNode }) {
  const current = certificate.status === 'ISSUED';
  return (
    <div className={`space-y-2 rounded-lg p-4 text-sm ${current ? 'bg-muted/40' : 'border border-dashed'}`} data-testid={`certificate-${certificate.status.toLowerCase()}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={current ? 'default' : 'secondary'}>{STATUS_LABELS[certificate.status]}</Badge>
          <span className="text-muted-foreground">{ISSUE_KIND_LABELS[certificate.issueKind]}</span>
        </div>
        {children}
      </div>
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Name</dt>
        <dd dir="auto" className="break-words font-medium">{certificate.recipientName}</dd>
        <dt className="text-muted-foreground">Training</dt>
        <dd dir="auto" className="break-words">{certificate.trainingTitle}</dd>
        <dt className="text-muted-foreground">Duration</dt>
        <dd>
          {certificate.duration ? formatDurationWords(certificate.duration) : <span className="text-amber-700">Unknown</span>}
          {certificate.placementStartDate && (
            <span className="text-muted-foreground">
              {' '}({formatCompletionDate(certificate.placementStartDate)} – {formatCompletionDate(certificate.completionDate)})
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground">Completion date</dt>
        <dd>{formatCompletionDate(certificate.completionDate)}</dd>
        <dt className="text-muted-foreground">HR signatory</dt>
        <dd dir="auto">{certificate.hrSignatoryName ?? <span className="text-amber-700">Not recorded</span>}</dd>
        <dt className="text-muted-foreground">Mentor signatory</dt>
        <dd dir="auto">{certificate.mentorSignatoryName ?? <span className="text-amber-700">Not recorded</span>}</dd>
        <dt className="text-muted-foreground">Issued</dt>
        <dd>{formatDateTime(certificate.issuedAt)}{certificate.issuedByName ? ` by ${certificate.issuedByName}` : ''}</dd>
        {certificate.supersededAt && (
          <>
            <dt className="text-muted-foreground">Replaced on</dt>
            <dd>{formatDateTime(certificate.supersededAt)}</dd>
          </>
        )}
        {certificate.reissueReason && (
          <>
            <dt className="text-muted-foreground">Reissue reason</dt>
            <dd dir="auto" className="whitespace-pre-wrap break-words">{certificate.reissueReason}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
