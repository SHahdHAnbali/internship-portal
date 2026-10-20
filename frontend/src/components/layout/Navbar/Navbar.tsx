import { useEffect, useRef, useState } from 'react';

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
  Menu,
  User,
  X,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
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

  // Small screens: the links open in a panel under the header. It is open
  // only for the page it was opened on, so any navigation closes it.
  const [menuOpenAt, setMenuOpenAt] =
    useState<string | null>(null);
  const menuOpen =
    menuOpenAt === location.pathname;
  const menuButton =
    useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpenAt(null);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

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
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
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

          <Button
            ref={menuButton}
            type="button"
            variant="ghost"
            size="icon-lg"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() =>
              setMenuOpenAt(
                menuOpen
                  ? null
                  : location.pathname,
              )
            }
          >
            {menuOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Main"
          className="border-t bg-background lg:hidden"
        >
          <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {navigation.map(
              (item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setMenuOpenAt(null)}
                    aria-current={
                      isActive(item.to)
                        ? 'page'
                        : undefined
                    }
                    className={[
                      'block rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                      isActive(item.to)
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}

            {!loading && !user && (
              <li className="sm:hidden">
                <Link
                  to="/login"
                  onClick={() => setMenuOpenAt(null)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}

/* =========================================================
   Guest
   ========================================================= */

function GuestActions() {
  return (
    <>
      <Link
        to="/login"
        className={buttonVariants({
          variant: 'ghost',
          className: 'hidden sm:inline-flex',
        })}
      >
        <LogIn className="mr-2 h-4 w-4" />

        Sign In
      </Link>

      <Link
        to="/apply"
        className={buttonVariants()}
      >
        Apply Now
      </Link>
    </>
  );
}

/* =========================================================
   Role-specific main action
   ========================================================= */

const ROLE_ACTIONS: Partial<
  Record<
    UserRole,
    { to: string; label: string; icon: typeof User }
  >
> = {
  APPLICANT: {
    to: '/applicant/profile',
    label: 'My Profile',
    icon: User,
  },
  HR: {
    to: '/hr/dashboard',
    label: 'HR Portal',
    icon: LayoutDashboard,
  },
  INTERN: {
    to: '/intern',
    label: 'Intern Portal',
    icon: BriefcaseBusiness,
  },
  MENTOR: {
    to: '/mentor',
    label: 'Mentor Portal',
    icon: User,
  },
};

// One link styled as a button (no nested <button>): a single tab stop, and
// an accessible name on small screens where only the icon is shown.
function RoleAction({
  role,
}: {
  role: UserRole | null;
}) {
  const action = role
    ? ROLE_ACTIONS[role]
    : undefined;

  if (!action) {
    return null;
  }

  const Icon = action.icon;

  return (
    <Link
      to={action.to}
      aria-label={action.label}
      className={buttonVariants({
        variant: 'outline',
      })}
    >
      <Icon className="mr-2 h-4 w-4 max-sm:mr-0" />

      <span className="hidden sm:inline">
        {action.label}
      </span>
    </Link>
  );
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
    // No "Internships" link: an applicant has already applied (each
    // applicant can apply only once).
    case 'APPLICANT':
      return [
        {
          label: 'Home',
          to: '/',
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
