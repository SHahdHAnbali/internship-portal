import { useQuery } from '@tanstack/react-query';

import { useDebounce } from '@/hooks/useDebounce';

import type { CvCheckView } from '../cv-check';
import { CvHashUnavailableError, fileKey, sha256Hex } from '../cv-hash';
import { checkCvDuplicate } from '../services/applications.service';

export const cvCheckQueryKey = ['applications', 'cv-check'] as const;

// CV check for the Apply page. As soon as a CV is selected its SHA-256 is
// computed in the browser and checked: already submitted with an application
// (any training: it cannot be used, and the upload would be refused) and,
// as a warning only, uploaded before. A failed check is "failed", never
// "clear".
export function useCvDuplicateCheck(
  cv: File | null,
  internshipId: string | null,
  requestedTraining: string | null,
): { view: CvCheckView; retry: () => void; retrying: boolean } {
  const hash = useQuery({
    queryKey: ['applications', 'cv-hash', cv ? fileKey(cv) : null],
    queryFn: () => sha256Hex(cv as File),
    enabled: cv !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // "Other" text is checked once typing pauses; case and surrounding spaces
  // do not matter to the rule, so they do not trigger new requests.
  const otherTraining = internshipId ? '' : (requestedTraining ?? '').trim();
  const debouncedOther = useDebounce(otherTraining, 400);
  const targetSettled = internshipId !== null || otherTraining === debouncedOther;
  const target = internshipId
    ? { internshipId, requestedTraining: null }
    : { internshipId: null, requestedTraining: debouncedOther || null };

  const check = useQuery({
    queryKey: [...cvCheckQueryKey, hash.data ?? null, target.internshipId, target.requestedTraining?.toLowerCase() ?? null],
    queryFn: () => checkCvDuplicate(hash.data as string, target.internshipId, target.requestedTraining),
    enabled: Boolean(hash.data) && targetSettled,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  let view: CvCheckView;
  if (!cv) view = { status: 'idle' };
  else if (hash.isError) view = hash.error instanceof CvHashUnavailableError ? { status: 'unavailable' } : { status: 'failed' };
  else if (hash.isPending || !targetSettled || check.isPending) view = { status: 'checking' };
  else if (check.isError) view = { status: 'failed' };
  else view = { status: 'checked', ...check.data };

  const retry = () => {
    if (hash.isError) void hash.refetch();
    else void check.refetch();
  };

  return { view, retry, retrying: hash.isFetching || check.isFetching };
}
