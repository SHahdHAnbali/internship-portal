import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';

import {
  Link,
  Navigate,
} from 'react-router-dom';

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_HOME, SET_PASSWORD_PATH } from '@/features/auth/role-home';
import { supabase } from '@/lib/supabase';

type AuthErrorLike = { code?: string; status?: number; message?: string } | null;
type Notice = 'link-sent' | 'reset-sent' | null;

const RATE_LIMIT_CODES = new Set(['over_request_rate_limit', 'over_email_send_rate_limit']);
// Refusals that would reveal whether an account exists; treated as "sent".
const NO_ACCOUNT_CODES = new Set(['otp_disabled', 'signup_disabled', 'user_not_found']);

function isRateLimited(error: AuthErrorLike) {
  return Boolean(error && (error.status === 429 || (error.code && RATE_LIMIT_CODES.has(error.code))));
}

function isNoAccount(error: AuthErrorLike) {
  return Boolean(error && ((error.code && NO_ACCOUNT_CODES.has(error.code)) || /signups not allowed/i.test(error.message ?? '')));
}

function signInErrorMessage(error: NonNullable<AuthErrorLike>): string {
  if (isRateLimited(error)) {
    return 'Too many sign-in attempts. Please wait a few minutes and try again.';
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect. If you have not set a password yet, use “Email me a one-time sign-in link”.';
    case 'email_not_confirmed':
      return 'Your email address is not verified yet. Use “Email me a one-time sign-in link” to verify it.';
    default:
      return 'We could not sign you in. Please try again.';
  }
}

// An email link that failed comes back with the error in the URL.
function readLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const code = params.get('error_code') ?? query.get('error_code');
  const error = params.get('error') ?? query.get('error');
  if (!code && !error) return null;
  return code === 'otp_expired'
    ? 'This email link has expired or was already used. Request a new one below.'
    : 'This email link is not valid. Request a new one below.';
}

export default function Login() {
  const { user, role, loading: authLoading, passwordSetupRequired, passwordRecovery } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<string | null>(() => readLinkError());
  const [cooldown, setCooldown] = useState(0);

  // Remove a failed link's error parameters so a reload does not repeat it.
  useEffect(() => {
    if (readLinkError()) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!authLoading && user && role) {
    return <Navigate to={passwordSetupRequired || passwordRecovery ? SET_PASSWORD_PATH : ROLE_HOME[role]} replace />;
  }

  // A persisted session (or an email-link callback) is still being restored:
  // wait instead of showing the form to a user who is already signed in.
  if (authLoading) {
    return (
      <div role="status" aria-label="Checking your sign-in" className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const cleanEmail = email.trim().toLowerCase();

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;
    if (!cleanEmail || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSigningIn(true);
    setError(null);
    // Password sign-in only: no email is sent here.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setSigningIn(false);
    if (signInError) {
      setError(signInErrorMessage(signInError));
      return;
    }
    // On success the auth listener loads the role and this page redirects.
    setPassword('');
  }

  async function sendLink(kind: 'sign-in' | 'reset') {
    if (!cleanEmail) {
      setError('Enter your email address first.');
      return;
    }
    if (cooldown > 0 || sending) return;
    setSending(true);
    setError(null);
    const redirectTo = `${window.location.origin}/login`;
    const { error: sendError } = kind === 'sign-in'
      ? await supabase.auth.signInWithOtp({
          email: cleanEmail,
          // Never creates an account: only existing users receive a link.
          options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
        })
      : await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    setSending(false);

    if (isRateLimited(sendError)) {
      setError('Too many emails were requested. Please wait a few minutes and try again.');
      return;
    }
    if (sendError && !isNoAccount(sendError)) {
      setError('We could not send the email. Please try again.');
      return;
    }
    setPassword('');
    setNotice(kind === 'sign-in' ? 'link-sent' : 'reset-sent');
    setCooldown(60);
  }

  const profileMissing = Boolean(user) && !role;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Sign in with your email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            {notice ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Check your email</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {notice === 'link-sent'
                      ? 'If an account exists for this address, we sent a one-time sign-in link to'
                      : 'If an account exists for this address, we sent a link to reset your password to'}
                  </p>
                  <p className="mt-1 text-sm font-medium">{cleanEmail}</p>
                </div>
                <Button type="button" variant="outline" className="w-full" disabled={sending || cooldown > 0}
                  onClick={() => void sendLink(notice === 'link-sent' ? 'sign-in' : 'reset')}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setNotice(null); setError(null); }}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <form onSubmit={(event) => void signIn(event)} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="pl-9" autoComplete="email" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" autoComplete="current-password" required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={signingIn}>
                    {signingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {signingIn ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>

                <div className="space-y-2 border-t pt-4">
                  <Button type="button" variant="outline" className="w-full" disabled={sending || cooldown > 0} onClick={() => void sendLink('sign-in')}>
                    {cooldown > 0 ? `Try again in ${cooldown}s` : 'Email me a one-time sign-in link'}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    First time here, or have not set a password yet? Use the email link, then choose a password.
                  </p>
                  <Button type="button" variant="ghost" className="w-full" disabled={sending || cooldown > 0} onClick={() => void sendLink('reset')}>
                    Forgot password?
                  </Button>
                </div>
              </div>
            )}

            {(error || profileMissing) && (
              <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error ?? 'Your account does not have active portal access. Contact your administrator.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
