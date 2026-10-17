import { supabase } from '@/lib/supabase';
import { navigateTo } from '@/lib/browser-navigation';

type ApiFetchOptions = RequestInit;

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

export const PASSWORD_SETUP_REQUIRED_MESSAGE =
  'Set a password before using the portal.';

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

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
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
