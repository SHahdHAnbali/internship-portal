import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  BriefcaseBusiness,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  type UserRole,
} from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/auth-context';

import { isNavigationItemActive } from './navigation-match';

interface NavigationItem {
  label: string;
  to: string;
}

function Navbar() {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const {
    user,
    role,
    fullName,
    loading,
    signOut,
  } = useAuth();

  const navigation =
    getNavigation(role, Boolean(user));

  const isActive = (
    path: string,
  ) =>
    isNavigationItemActive(
      location.pathname,
      path,
      navigation.map((item) => item.to),
    );

  const navLinkClass = (
    path: string,
  ) =>
    [
      'text-sm font-medium transition-colors',
      isActive(path)
        ? 'text-foreground'
        : 'text-muted-foreground hover:text-foreground',
    ].join(' ');

  async function handleSignOut() {
    await signOut();

    navigate('/', {
      replace: true,
    });
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>

          <span className="hidden text-lg font-semibold tracking-tight sm:inline">
            Internship Portal
          </span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-6 lg:flex">
          {navigation.map(
            (item) => (
              <Link
                key={item.to}
                to={item.to}
                className={
                  navLinkClass(
                    item.to,
                  )
                }
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {loading ? (
            <div className="flex h-9 items-center px-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !user ? (
            <GuestActions />
          ) : (
            <>
              {/* Current user */}
              <div className="hidden items-center gap-3 md:flex">
                <div className="text-right">
                  <p className="max-w-40 truncate text-sm font-medium">
                    {fullName ??
                      user.email ??
                      'User'}
                  </p>

                  {role && (
                    <p className="text-xs text-muted-foreground">
                      {getRoleLabel(
                        role,
                      )}
                    </p>
                  )}
                </div>

                {role && (
                  <Badge variant="secondary">
                    {getRoleLabel(
                      role,
                    )}
                  </Badge>
                )}
              </div>

              <RoleAction
                role={role}
              />

              <Button
                type="button"
                variant="ghost"
                onClick={
                  handleSignOut
                }
              >
                <LogOut className="mr-2 h-4 w-4" />

                <span className="hidden sm:inline">
                  Sign Out
                </span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* =========================================================
   Guest
   ========================================================= */

function GuestActions() {
  return (
    <>
      <Link to="/login">
        <Button
          variant="ghost"
          className="hidden sm:inline-flex"
        >
          <LogIn className="mr-2 h-4 w-4" />

          Sign In
        </Button>
      </Link>

      <Link to="/apply">
        <Button>
          Apply Now
        </Button>
      </Link>
    </>
  );
}

/* =========================================================
   Role-specific main action
   ========================================================= */

function RoleAction({
  role,
}: {
  role: UserRole | null;
}) {
  switch (role) {
    case 'APPLICANT':
      return (
        <Link to="/applicant/profile">
          <Button variant="outline">
            <User className="mr-2 h-4 w-4" />

            <span className="hidden sm:inline">
              My Profile
            </span>
          </Button>
        </Link>
      );

    case 'HR':
      return (
        <Link to="/hr/dashboard">
          <Button variant="outline">
            <LayoutDashboard className="mr-2 h-4 w-4" />

            <span className="hidden sm:inline">
              HR Portal
            </span>
          </Button>
        </Link>
      );

    case 'INTERN':
      return (
        <Link to="/intern">
          <Button variant="outline">
            <BriefcaseBusiness className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Intern Portal</span>
          </Button>
        </Link>
      );

    case 'MENTOR':
      return (
        <Link to="/mentor">
          <Button variant="outline">
            <User className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Mentor Portal</span>
          </Button>
        </Link>
      );

    default:
      return null;
  }
}

/* =========================================================
   Navigation by role
   ========================================================= */

function getNavigation(
  role: UserRole | null,
  isLoggedIn: boolean,
): NavigationItem[] {
  if (!isLoggedIn) {
    return [
      {
        label: 'Home',
        to: '/',
      },
      {
        label: 'Internships',
        to: '/internships',
      },
      {
        label: 'Apply',
        to: '/apply',
      },
    ];
  }

  switch (role) {
    case 'APPLICANT':
      return [
        {
          label: 'Home',
          to: '/',
        },
        {
          label: 'Internships',
          to: '/internships',
        },
        {
          label: 'My Profile',
          to: '/applicant/profile',
        },
      ];

    case 'HR':
      return [
        {
          label: 'Home',
          to: '/',
        },
        {
          label: 'Dashboard',
          to: '/hr/dashboard',
        },
        {
          label: 'Applications',
          to: '/hr/applications',
        },
        {
          label: 'Training Planning',
          to: '/hr/training-planning',
        },
        {
          label: 'Internships',
          to: '/hr/internships',
        },
        {
          label: 'Intern Progress',
          to: '/hr/intern-progress',
        },
      ];

    case 'INTERN':
      return [
        {
          label: 'Home',
          to: '/',
        },
        {
          label: 'Dashboard',
          to: '/intern/dashboard',
        },
        {
          label: 'My Internship',
          to: '/intern/my-internship',
        },
        {
          label: 'Weekly Reports',
          to: '/intern/training-reports',
        },
        {
          label: 'Evaluations',
          to: '/intern/evaluations',
        },
        {
          label: 'Certificates',
          to: '/intern/certificates',
        },
      ];

    case 'ADMIN':
      return [
        {
          label: 'Home',
          to: '/',
        },
        {
          label: 'Admin Dashboard',
          to: '/admin/dashboard',
        },
        {
          label: 'User Management',
          to: '/admin/users',
        },
        {
          label: 'Roles & Permissions',
          to: '/admin/roles',
        },
        {
          label: 'System Settings',
          to: '/admin/settings',
        },
      ];

    case 'MENTOR':
      return [
        {
          label: 'Assigned Interns',
          to: '/mentor',
        },
        {
          label: 'Evaluations',
          to: '/mentor/evaluations',
        },
      ];

    default:
      return [
        {
          label: 'Home',
          to: '/',
        },
      ];
  }
}

/* =========================================================
   Role label
   ========================================================= */

function getRoleLabel(
  role: UserRole,
) {
  const labels: Record<
    UserRole,
    string
  > = {
    APPLICANT:
      'Applicant',

    INTERN:
      'Intern',

    MENTOR:
      'Mentor',

    HR:
      'HR',

    ADMIN:
      'Admin',
  };

  return labels[role];
}

export default Navbar;
