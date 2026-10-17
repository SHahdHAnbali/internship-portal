import type { ReactNode } from 'react';

import {
  Navigate,
  useLocation,
} from 'react-router-dom';

import { Loader2 } from 'lucide-react';

import { type UserRole } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_HOME, SET_PASSWORD_PATH } from '@/features/auth/role-home';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  loginPath?: string;
}

// UX-only protection; the backend enforces every role and ownership rule.
export default function RoleGuard({
  children,
  allowedRoles,
  loginPath = '/login',
}: RoleGuardProps) {
  const { user, role, loading, passwordSetupRequired, passwordRecovery } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  // Not signed in (or the session ended): sign in, then come back.
  if (!user) {
    return (
      <Navigate
        to={loginPath}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Signed in, but no portal role could be loaded: the login page explains.
  if (!role) {
    return <Navigate to={loginPath} replace />;
  }

  // First sign-in (or a password-reset link): choose a password first.
  if (passwordSetupRequired || passwordRecovery) {
    return <Navigate to={SET_PASSWORD_PATH} replace />;
  }

  // Wrong role: go to this user's own portal instead.
  if (!allowedRoles.includes(role)) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }

  return <>{children}</>;
}
