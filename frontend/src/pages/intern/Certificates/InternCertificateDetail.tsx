import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, FileDown, LoaderCircle, Printer, RotateCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { CertificatePrintCopy, CertificateSheet } from '@/features/certificates/CertificateDocument';
import { printCertificate } from '@/features/certificates/print';
import { getMyCertificate } from '@/features/certificates/certificates.service';
import { certificateErrorMessage } from '@/features/certificates/messages';
import { certificateQueryKeys } from '@/features/certificates/query-keys';

// One of the intern's own certificates, addressed by its placement. Printing
// and "Save as PDF" both use the browser's print dialog; only the
// certificate is printed (see certificate.css).
export default function InternCertificateDetail() {
  const { placementId = '' } = useParams();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const query = useQuery({
    queryKey: certificateQueryKeys.internCertificate(userId, placementId),
    queryFn: () => getMyCertificate(placementId),
    retry: false,
    enabled: userId !== '' && placementId !== '',
  });
  const certificate = query.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
      <Link to="/intern/certificates" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All certificates
      </Link>

      {query.isPending ? (
        <Card><CardContent className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-primary" /> Loading your certificate…
        </CardContent></Card>
      ) : query.isError || !certificate ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-start gap-4 py-8 sm:flex-row sm:items-center">
            <AlertCircle className="size-6 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Unable to load this certificate</p>
              <p className="mt-1 text-sm text-muted-foreground">{certificateErrorMessage(query.error)}</p>
            </div>
            <Button variant="outline" onClick={() => void query.refetch()}><RotateCw className="mr-2 size-4" /> Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-primary">CERTIFICATE</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{certificate.certificateTitle}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                To save a PDF, choose “Save as PDF” as the destination in the print dialog. The page is A4 landscape.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => printCertificate(certificate)}>
                <Printer className="mr-2 size-4" /> Print
              </Button>
              <Button type="button" variant="outline" onClick={() => printCertificate(certificate)}>
                <FileDown className="mr-2 size-4" /> Save as PDF
              </Button>
            </div>
          </header>

          <section aria-label="Certificate preview" className="rounded-xl border bg-muted/40 p-3 shadow-sm sm:p-5">
            <div className="mx-auto max-w-[297mm] shadow-md">
              <CertificateSheet certificate={certificate} data-testid="certificate-preview" />
            </div>
          </section>
          <CertificatePrintCopy certificate={certificate} />
        </>
      )}
    </div>
  );
}
