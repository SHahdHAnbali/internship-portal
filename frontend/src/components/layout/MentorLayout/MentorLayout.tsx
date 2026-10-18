import { BriefcaseBusiness, ClipboardList, LogOut } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

export default function MentorLayout() {
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
          <Link to="/mentor" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BriefcaseBusiness className="size-5" /></span>
            <span><span className="block text-sm font-semibold">Internship Portal</span><span className="block text-xs text-muted-foreground">Mentor workspace</span></span>
          </Link>
        </div>
        <nav aria-label="Mentor navigation" className="flex-1 space-y-1 p-4">
          <NavLink to="/mentor" end className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            <ClipboardList className="size-4" />Assigned Interns
          </NavLink>
        </nav>
        <div className="border-t p-4">
          <p className="mb-3 truncate px-2 text-sm font-medium">{fullName ?? user?.email ?? 'Mentor'}</p>
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}><LogOut className="mr-2 size-4" />Sign out</Button>
        </div>
      </aside>
      <main className="min-h-screen lg:pl-64"><Outlet /></main>
    </div>
  );
}
