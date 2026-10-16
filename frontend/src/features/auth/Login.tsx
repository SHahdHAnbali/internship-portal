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
  Mail,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_HOME } from '@/features/auth/role-home';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const { user, role, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!authLoading && user && role) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  async function sendLoginLink(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Enter your email address.');
      return;
    }
    if (cooldown > 0 || sending) return;

    setSending(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        shouldCreateUser: false,
      },
    });

    if (signInError) {
      setError(signInError.message.toLowerCase().includes('rate limit')
        ? 'Too many login emails were requested. Please wait a few minutes and try again.'
        : signInError.message);
      setSending(false);
      return;
    }

    setSent(true);
    setCooldown(60);
    setSending(false);
  }

  const profileMissing = !authLoading && Boolean(user) && !role;

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
            <CardDescription>Access your portal with a secure email link.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Check your email</h2>
                  <p className="mt-2 text-sm text-muted-foreground">We sent a secure sign-in link to</p>
                  <p className="mt-1 text-sm font-medium">{email}</p>
                </div>
                <Button type="button" variant="outline" className="w-full" disabled={sending || cooldown > 0} onClick={() => void sendLoginLink()}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend sign-in link'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setSent(false); setError(null); setCooldown(0); }}>
                  Use another email
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void sendLoginLink(event)} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="pl-9" autoComplete="email" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={sending || cooldown > 0}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sending ? 'Sending secure link…' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Continue with email'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">No password required. We will email you a secure sign-in link.</p>
              </form>
            )}

            {(error || profileMissing) && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error ?? 'Your account does not have active portal access. Contact your administrator.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
