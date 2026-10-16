import {
    useCallback,
    useEffect,
    useMemo,
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
  
    const [loading, setLoading] =
      useState(true);
  
    // Only uses state setters, so it is stable across renders.
    const loadProfile = useCallback(async (
      currentUser: User | null,
    ) => {
      if (!currentUser) {
        setRole(null);
        setFullName(null);
        return;
      }
  
      const {
        data,
        error,
      } =
        await supabase
          .from('profiles')
          .select(`
            role,
            full_name,
            is_active
          `)
          .eq(
            'id',
            currentUser.id,
          )
          .maybeSingle();
  
      if (error) {
        console.error(
          'Unable to load user profile:',
          error,
        );
  
        setRole(null);
        setFullName(null);
  
        return;
      }
  
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
    }, []);
  
    useEffect(() => {
      let mounted = true;
  
      const initialize =
        async () => {
          const {
            data,
          } =
            await supabase.auth.getSession();
  
          if (!mounted) {
            return;
          }
  
          setSession(
            data.session,
          );
  
          setUser(
            data.session?.user ??
              null,
          );
  
          await loadProfile(
            data.session?.user ??
              null,
          );
  
          if (mounted) {
            setLoading(false);
          }
        };
  
      void initialize();
  
      const {
        data: listener,
      } =
        supabase.auth.onAuthStateChange(
          async (
            _event,
            nextSession,
          ) => {
            setSession(
              nextSession,
            );
  
            setUser(
              nextSession?.user ??
                null,
            );
  
            await loadProfile(
              nextSession?.user ??
                null,
            );
  
            setLoading(false);
          },
        );
  
      return () => {
        mounted = false;
  
        listener.subscription.unsubscribe();
      };
    }, [loadProfile]);
  
    async function signOut() {
      await supabase.auth.signOut();
  
      setSession(null);
      setUser(null);
      setRole(null);
      setFullName(null);
    }
  
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
        }),
        [
          user,
          session,
          role,
          fullName,
          loading,
          refreshProfile,
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
  
