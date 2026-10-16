import { supabase } from '@/lib/supabase';

type ApiFetchOptions = RequestInit;

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';

// Sends the current Supabase access token. A 401 from the backend means the
// session is no longer valid there (expired, revoked or removed), so the
// local session is cleared and route guards send the user to sign in.
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
    await supabase.auth.signOut().catch(() => undefined);
    throw new Error(SESSION_EXPIRED_MESSAGE);
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
