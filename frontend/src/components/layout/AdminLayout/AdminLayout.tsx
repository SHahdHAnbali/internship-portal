import { LayoutDashboard, LogOut, Settings, ShieldCheck, Users } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

const navigation = [
  { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'User Management', to: '/admin/users', icon: Users },
  { label: 'Roles & Permissions', to: '/admin/roles', icon: ShieldCheck },
  { label: 'System Settings', to: '/admin/settings', icon: Settings },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted'
  }`;

export default function AdminLayout() {
  const { fullName, user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Internship Portal</span>
              <span className="block text-xs text-muted-foreground">Administration</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Admin navigation" className="flex-1 space-y-1 p-4">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="size-4" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="mb-3 truncate px-2 text-sm font-medium">{fullName ?? user?.email ?? 'Administrator'}</p>
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="mr-2 size-4" />Sign out
          </Button>
        </div>
      </aside>

      <header className="border-b bg-background lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">Administration</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="mr-2 size-4" />Sign out</Button>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="size-4" /><span className="whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-screen lg:pl-64"><Outlet /></main>
    </div>
  );
}
