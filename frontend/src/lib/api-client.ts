import { supabase } from '@/lib/supabase';
import { getSignedInUserId } from '@/lib/auth-identity';
import { navigateTo } from '@/lib/browser-navigation';

type ApiFetchOptions = RequestInit;

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

export const PASSWORD_SETUP_REQUIRED_MESSAGE =
  'Set a password before using the portal.';

export const IDENTITY_MISMATCH_MESSAGE =
  'You signed in or out in another tab. Reload this page to continue.';

export const SESSION_RENEWED_MESSAGE =
  'Your sign-in was renewed while this request was being sent. Nothing was changed; try again.';

// Sends the current Supabase access token. A 401 from the backend means the
// session is no longer valid there (expired, revoked or removed), so this
// browser's session is cleared and route guards send the user to sign in.
// Only the local session is ended: the user's other browsers and devices keep
// theirs (a global sign-out would revoke them all).
export async function authenticatedFetch(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  // The stored session can belong to someone else than the user this tab
  // shows (another tab signed out and in again, and this tab has not caught
  // up yet). Then nothing is sent: the request would act as the other user
  // and its answer would be shown as this tab's user's data. The session is
  // left alone (it is the other tab's current sign-in). The comparison uses
  // the session's user as Supabase reports it, never decoded token contents;
  // the backend still verifies the token and authorizes every request.
  const sessionUserId = session.user?.id;
  const signedInUserId = getSignedInUserId();
  if (!sessionUserId || !signedInUserId || sessionUserId !== signedInUserId) {
    throw new Error(IDENTITY_MISMATCH_MESSAGE);
  }

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Sign out only if the stored session is still the one that sent this
    // request. A late 401 for a previous user (another account signed in
    // meanwhile, in this tab or another) must not end the newer sign-in, and a
    // 401 for an older token of the same user (the sign-in was renewed while
    // the request was on its way) must not end the renewed session. Only the
    // stored tokens are compared; nothing is decoded or logged.
    const { data: current } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const currentUserId = current.session?.user?.id;
    if (currentUserId && currentUserId !== sessionUserId) {
      throw new Error(IDENTITY_MISMATCH_MESSAGE);
    }
    if (currentUserId && current.session?.access_token && current.session.access_token !== session.access_token) {
      throw new Error(SESSION_RENEWED_MESSAGE);
    }
    if (currentUserId) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  // The backend refuses portal requests until the person has set a password
  // (code PASSWORD_SETUP_REQUIRED): open the Set Password page.
  if (response.status === 403) {
    const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null;
    if (body?.code === 'PASSWORD_SETUP_REQUIRED') {
      navigateTo('/set-password');
      throw new Error(PASSWORD_SETUP_REQUIRED_MESSAGE);
    }
  }

  return response;
}

// Readable message from a Nest error body ({ message: string | string[] }).
export async function apiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { message?: unknown }
    | null;
  const message = body?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.map(String).join(' ');
  }
  return fallback;
}
