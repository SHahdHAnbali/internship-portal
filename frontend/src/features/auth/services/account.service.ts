import { env } from '@/config/env';
import { apiErrorMessage, authenticatedFetch } from '@/lib/api-client';

// Tells the backend that the signed-in person has just set a password with
// Supabase Auth. Only the verified session's own profile is updated; the
// password itself is never sent here.
export async function markPasswordSet(): Promise<void> {
  const response = await authenticatedFetch(`${env.apiUrl}/account/password-setup`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, 'Unable to finish setting up your password.'));
  }
}
