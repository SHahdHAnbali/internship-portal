import { CertificateRequestError } from './certificates.service';

// Query keys for certificate data, scoped by the signed-in user (in addition
// to the cache being cleared when the user changes), so one user's cached
// certificates are never served to another.
export const certificateQueryKeys = {
  internCertificates: (userId: string) => ['intern', userId, 'certificates'] as const,
  internCertificate: (userId: string, placementId: string) => ['intern', userId, 'certificates', placementId] as const,
  // Prefix of every HR certificate query of this user.
  hrAll: (userId: string) => ['hr', userId, 'placement-certificates'] as const,
  hrPlacementCertificates: (userId: string, placementId: string) => ['hr', userId, 'placement-certificates', placementId] as const,
};

// Refusals that are not a loss of access (the sign-in was renewed while the
// request was on its way, or another tab changed the sign-in): data shown so
// far stays, the error is reported, nothing is retried automatically.
const NOT_AN_ACCESS_LOSS = new Set(['SESSION_RENEWED', 'IDENTITY_MISMATCH']);

export function isAccessError(error: unknown): boolean {
  return error instanceof CertificateRequestError
    && error.outcome === 'not-applied'
    && !(error.code !== undefined && NOT_AN_ACCESS_LOSS.has(error.code))
    && (error.status === 401 || error.status === 403 || error.status === 404);
}
