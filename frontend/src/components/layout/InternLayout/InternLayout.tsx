import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  ListTodo,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

const navigation = [
  { label: 'Dashboard', to: '/intern/dashboard', icon: LayoutDashboard },
  { label: 'My Internship', to: '/intern/my-internship', icon: BriefcaseBusiness },
  { label: 'Assigned Tasks', to: '/intern/tasks', icon: ListTodo },
  { label: 'Weekly Reports', to: '/intern/training-reports', icon: FileText },
  { label: 'My Profile', to: '/intern/profile', icon: UserRound },
];

export default function InternLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { fullName, user, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = fullName ?? user?.email ?? 'Intern';

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  function renderNavigation(mobile = false) {
    return navigation.map(({ label, to, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/intern/dashboard'}
        onClick={() => mobile && setMobileOpen(false)}
        className={({ isActive }) => [
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        ].join(' ')}
      >
        <Icon className="size-4" />
        {label}
      </NavLink>
    ));
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link to="/intern" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BriefcaseBusiness className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Internship Portal</span>
              <span className="block text-xs text-muted-foreground">Intern workspace</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Intern navigation" className="flex-1 space-y-1 p-4">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
          {renderNavigation()}
        </nav>

        <div className="border-t p-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block text-xs text-muted-foreground">Intern</span>
            </span>
          </div>
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link to="/intern" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BriefcaseBusiness className="size-4" />
          </span>
          Intern Portal
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X /> : <Menu />}
        </Button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 z-40 border-b bg-background p-4 shadow-lg lg:hidden">
          <nav aria-label="Mobile intern navigation" className="space-y-1">
            {renderNavigation(true)}
            <Button variant="ghost" className="mt-2 w-full justify-start" onClick={handleSignOut}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </nav>
        </div>
      )}

      <main className="min-h-screen lg:pl-64">
        <Outlet />
      </main>
    </div>
  );
}
