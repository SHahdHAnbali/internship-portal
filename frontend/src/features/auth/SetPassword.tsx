import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-context';
import { passwordProblem, PASSWORD_MIN_LENGTH } from '@/features/auth/password-rules';
import { ROLE_HOME } from '@/features/auth/role-home';
import { markPasswordSet } from '@/features/auth/services/account.service';
import { supabase } from '@/lib/supabase';

type Stage = 'form' | 'saving' | 'recording' | 'record-failed';

// Messages for Supabase Auth refusals; raw server text is never shown.
function updateErrorMessage(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'weak_password':
      return 'Choose a stronger password.';
    case 'reauthentication_needed':
    case 'session_not_found':
    case 'session_expired':
      return 'For your security, sign in again with a one-time email link, then set your password.';
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return error.status === 401
        ? 'Your sign-in has expired. Sign in again with a one-time email link.'
        : 'We could not save your password. Please try again.';
  }
}

// Shown after the first verified email-link sign-in (and after a password
// reset link). The password goes only to Supabase Auth; the backend is then
// told that setup is complete, for the signed-in person's own profile.
export default function SetPassword() {
  const {
    user,
    role,
    loading,
    passwordSetupRequired,
    passwordRecovery,
    refreshProfile,
    clearPasswordRecovery,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  // Guards against a second submission before React re-renders.
  const inFlight = useRef(false);

  if (loading) {
    return (
      <div role="status" aria-label="Checking your sign-in" className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  // Only a verified session may set a password; no portal role means no access.
  if (!user || !role) {
    return <Navigate to="/login" replace />;
  }
  // Already set and not resetting: nothing to do here.
  if (!passwordSetupRequired && !passwordRecovery && stage === 'form') {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }
  const home = ROLE_HOME[role];

  async function recordSetup() {
    setStage('recording');
    setError(null);
    try {
      await markPasswordSet();
      await refreshProfile();
      clearPasswordRecovery();
      navigate(home, { replace: true });
    } catch {
      // The password is already saved in Supabase Auth: retry only this step.
      setStage('record-failed');
    } finally {
      inFlight.current = false;
    }
  }

  function retryRecord() {
    if (inFlight.current) return;
    inFlight.current = true;
    void recordSetup();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage !== 'form' || inFlight.current) return;
    const problem = passwordProblem(password, confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setStage('saving');
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    // An unchanged password (e.g. a retry after an interrupted setup) is fine.
    if (updateError && updateError.code !== 'same_password') {
      setError(updateErrorMessage(updateError));
      setStage('form');
      inFlight.current = false;
      return;
    }
    setPassword('');
    setConfirmation('');
    await recordSetup();
  }

  const busy = stage === 'saving' || stage === 'recording';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />
            {passwordRecovery ? 'Choose a new password' : 'Set your password'}
          </CardTitle>
          <CardDescription>
            {passwordRecovery
              ? 'Enter a new password for your account.'
              : 'Your email is verified. Choose a password to sign in with from now on.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === 'record-failed' ? (
            <div className="space-y-4">
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Your password was saved, but we could not finish setting up your account.
              </p>
              <Button type="button" className="w-full" onClick={retryRecord}>Try again</Button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-medium">New password</label>
                <Input id="new-password" type="password" autoComplete="new-password" value={password}
                  onChange={(event) => setPassword(event.target.value)} disabled={busy} required minLength={PASSWORD_MIN_LENGTH} />
                <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)} disabled={busy} required />
              </div>
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy ? 'Saving…' : 'Save password'}
              </Button>
              {passwordRecovery && !passwordSetupRequired && (
                <Button type="button" variant="ghost" className="w-full" disabled={busy}
                  onClick={() => { clearPasswordRecovery(); navigate(home, { replace: true }); }}>
                  Keep my current password
                </Button>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
