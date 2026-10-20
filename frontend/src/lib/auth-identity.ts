// The user this browser tab currently shows as signed in, as AuthProvider
// last reported it (undefined until the first auth event; null when signed
// out). authenticatedFetch compares it with the user of the session whose
// token it is about to send, so a token another tab signed in with is never
// sent while this tab still shows a different user. Only the user id is kept
// here, never a token.
let signedInUserId: string | null | undefined;

export function setSignedInUserId(userId: string | null): void {
  signedInUserId = userId;
}

export function getSignedInUserId(): string | null | undefined {
  return signedInUserId;
}
