import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  Session,
  User,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import {
  AuthContext,
  type UserRole,
} from './auth-context';

export type { UserRole } from './auth-context';

// Recovery mode must survive a refresh of /login or /set-password. Kept per
// browser tab (sessionStorage) and bound to the user who opened the reset
// link; it holds only that user id, never a token or password.
const RECOVERY_KEY = 'portal.passwordRecoveryUser';

function readRecoveryUser(): string | null {
  try {
    return window.sessionStorage.getItem(RECOVERY_KEY);
  } catch {
    return null;
  }
}

function writeRecoveryUser(userId: string | null) {
  try {
    if (userId) {
      window.sessionStorage.setItem(RECOVERY_KEY, userId);
    } else {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    }
  } catch {
    // Storage unavailable (private mode): recovery then lasts for this page only.
  }
}

// The session is restored by Supabase from its persisted storage (and from the
// email-link callback on /login). The role always comes from `profiles`; it is
// only used for routing, the backend authorizes every request itself.
export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [session, setSession] =
    useState<Session | null>(null);

  const [role, setRole] =
    useState<UserRole | null>(null);

  const [fullName, setFullName] =
    useState<string | null>(null);

  // undefined = unknown (no profile loaded, or the password_set_at column does
  // not exist yet because its migration has not been applied).
  const [passwordSetAt, setPasswordSetAt] =
    useState<string | null | undefined>(undefined);

  const [passwordRecovery, setPasswordRecovery] =
    useState(false);

  // True until the first auth state is known and while the profile of a newly
  // signed-in user is loading, so guards never act on a half-loaded state.
  const [loading, setLoading] =
    useState(true);

  // Each profile load gets a number; only the latest one may update state, so
  // a slow load for a previous session cannot overwrite a newer one.
  const loadSequence = useRef(0);
  const profileUserId = useRef<string | null>(null);

  // Only uses state setters and refs, so it is stable across renders.
  const loadProfile = useCallback(async (
    currentUser: User | null,
  ) => {
    const sequence = ++loadSequence.current;

    if (!currentUser) {
      profileUserId.current = null;
      setRole(null);
      setFullName(null);
      setPasswordSetAt(undefined);
      setLoading(false);
      return;
    }

    const query = (columns: string) =>
      supabase
        .from('profiles')
        .select(columns)
        .eq(
          'id',
          currentUser.id,
        )
        .maybeSingle<{
          role: string;
          full_name: string | null;
          is_active: boolean;
          password_set_at?: string | null;
        }>();

    let {
      data,
      error,
    } =
      await query('role, full_name, is_active, password_set_at');

    // Until migration 20261017020000 is applied the column does not exist:
    // keep sign-in working and leave password setup inactive.
    let passwordColumnMissing = false;
    if (error?.code === '42703') {
      passwordColumnMissing = true;
      ({ data, error } = await query('role, full_name, is_active'));
    }

    if (sequence !== loadSequence.current) {
      return;
    }

    profileUserId.current = currentUser.id;

    if (error) {
      console.error('Unable to load user profile');
      setRole(null);
      setFullName(null);
      setPasswordSetAt(undefined);
      setLoading(false);
      return;
    }

    setPasswordSetAt(
      passwordColumnMissing || !data
        ? undefined
        : data.password_set_at ?? null,
    );

    // A deactivated account keeps its profile but gets no portal; the
    // backend refuses its requests regardless.
    setRole(
      data?.is_active === false
        ? null
        : (data?.role as UserRole | null) ??
          null,
    );

    setFullName(
      data?.full_name ??
        null,
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    // One listener for every auth event. INITIAL_SESSION delivers the session
    // restored from storage (or from the email-link callback) once Supabase
    // has initialized. The callback stays synchronous, as Supabase recommends;
    // the profile is loaded outside it.
    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          nextSession,
        ) => {
          const nextUser =
            nextSession?.user ??
            null;

          // A password-reset link: the person must choose a new password,
          // also after a refresh (same tab, same user).
          if (event === 'PASSWORD_RECOVERY' && nextUser) {
            writeRecoveryUser(nextUser.id);
            setPasswordRecovery(true);
          } else if (!nextUser) {
            writeRecoveryUser(null);
            setPasswordRecovery(false);
          } else {
            const recoveryUser = readRecoveryUser();
            if (recoveryUser && recoveryUser !== nextUser.id) {
              writeRecoveryUser(null);
            }
            setPasswordRecovery(recoveryUser === nextUser.id);
          }

          setSession(nextSession);
          setUser(nextUser);

          // A different user (or none): hold the guards until the role is known.
          // The same user (token refresh, re-delivered sign-in): refresh the
          // role in the background without blocking the current page.
          if ((nextUser?.id ?? null) !== profileUserId.current) {
            setLoading(true);
          }

          window.setTimeout(() => {
            void loadProfile(nextUser);
          }, 0);
        },
      );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Signs out this browser only. A global sign-out would also end the
  // user's sessions on every other browser and device.
  const signOut = useCallback(async () => {
    loadSequence.current += 1;
    await supabase.auth.signOut({ scope: 'local' });

    profileUserId.current = null;
    setSession(null);
    setUser(null);
    setRole(null);
    setFullName(null);
    setPasswordSetAt(undefined);
    writeRecoveryUser(null);
    setPasswordRecovery(false);
    setLoading(false);
  }, []);

  // After a successful reset, or when the person keeps their current password.
  const clearPasswordRecovery = useCallback(() => {
    writeRecoveryUser(null);
    setPasswordRecovery(false);
  }, []);

  const passwordSetupRequired =
    role !== null && passwordSetAt === null;

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session?.user ?? null);
  }, [loadProfile]);

  const value =
    useMemo(
      () => ({
        user,
        session,
        role,
        fullName,
        loading,
        signOut,
        refreshProfile,
        passwordSetupRequired,
        passwordRecovery,
        clearPasswordRecovery,
      }),
      [
        user,
        session,
        role,
        fullName,
        loading,
        signOut,
        refreshProfile,
        passwordSetupRequired,
        passwordRecovery,
        clearPasswordRecovery,
      ],
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}
