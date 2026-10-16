import type { ReactNode } from 'react';

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <DashboardSidebar />

      <SidebarInset>
        <DashboardHeader />

        <div className="border-t">
          <div className="flex items-center px-4 py-2">
            <SidebarTrigger />
          </div>
        </div>

        <main className="flex-1 bg-background">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default DashboardLayout;