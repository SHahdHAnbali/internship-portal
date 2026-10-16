import {
    BriefcaseBusiness,
    ClipboardList,
    FileText,
    LayoutDashboard,
    LogOut,
    Menu,
    UsersRound,
    X,
  } from 'lucide-react';
  
  import {
    Link,
    NavLink,
    Outlet,
  } from 'react-router-dom';
  
  import {
    useState,
  } from 'react';
  
  import { Button } from '@/components/ui/button';
  
  const navigation = [
    {
      label: 'Dashboard',
      to: '/hr/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Applications',
      to: '/hr/applications',
      icon: FileText,
    },
    {
      label: 'Training Planning',
      to: '/hr/training-planning',
      icon: ClipboardList,
    },
    {
      label: 'Internships',
      to: '/hr/internships',
      icon: BriefcaseBusiness,
    },
    {
      label: 'Intern Progress',
      to: '/hr/intern-progress',
      icon: UsersRound,
    },
  ];
  
  export default function HRLayout() {
    const [
      mobileOpen,
      setMobileOpen,
    ] = useState(false);
  
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        {/* =========================
            Desktop Sidebar
           ========================= */}
  
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-slate-200 px-6">
            <Link
              to="/hr/dashboard"
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3F72AF] text-white">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
  
              <div>
                <p className="text-sm font-semibold text-[#112D4E]">
                  Internship Portal
                </p>
  
                <p className="text-xs text-slate-500">
                  HR Workspace
                </p>
              </div>
            </Link>
          </div>
  
          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navigation.map(
              ({
                label,
                to,
                icon: Icon,
              }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({
                    isActive,
                  }) =>
                    [
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-[#DBE2EF] text-[#112D4E]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#112D4E]',
                    ].join(' ')
                  }
                >
                  <Icon className="h-4 w-4" />
  
                  {label}
                </NavLink>
              ),
            )}
          </nav>
  
          {/* Bottom */}
          <div className="border-t border-slate-200 p-4">
            <Link
              to="/"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#112D4E]"
            >
              <LogOut className="h-4 w-4" />
  
              Back to Website
            </Link>
          </div>
        </aside>
  
        {/* =========================
            Mobile Header
           ========================= */}
  
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <Link
            to="/hr/dashboard"
            className="flex items-center gap-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3F72AF] text-white">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
  
            <span className="font-semibold text-[#112D4E]">
              HR Portal
            </span>
          </Link>
  
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() =>
              setMobileOpen(
                (current) =>
                  !current,
              )
            }
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </header>
  
        {/* =========================
            Mobile Navigation
           ========================= */}
  
        {mobileOpen && (
          <div className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white p-4 shadow-sm lg:hidden">
            <nav className="space-y-1">
              {navigation.map(
                ({
                  label,
                  to,
                  icon: Icon,
                }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() =>
                      setMobileOpen(
                        false,
                      )
                    }
                    className={({
                      isActive,
                    }) =>
                      [
                        'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium',
                        isActive
                          ? 'bg-[#DBE2EF] text-[#112D4E]'
                          : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')
                    }
                  >
                    <Icon className="h-4 w-4" />
  
                    {label}
                  </NavLink>
                ),
              )}
  
              <Link
                to="/"
                onClick={() =>
                  setMobileOpen(
                    false,
                  )
                }
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
  
                Back to Website
              </Link>
            </nav>
          </div>
        )}
  
        {/* =========================
            Page Content
           ========================= */}
  
        <main className="lg:pl-64">
          <Outlet />
        </main>
      </div>
    );
  }