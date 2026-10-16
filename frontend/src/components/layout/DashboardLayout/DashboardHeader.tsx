import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { SidebarTrigger } from '@/components/ui/sidebar';

function DashboardHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background">
      <div className="flex w-full items-center gap-3 px-4">
        <SidebarTrigger />

        <Separator orientation="vertical" className="h-5" />

        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>
                HR Dashboard
              </BreadcrumbPage>
            </BreadcrumbItem>

            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbPage>
                Overview
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
          >
            <Bell />

            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
            <span className="sr-only">
              Notifications
            </span>
          </Button>

          <Separator
            orientation="vertical"
            className="mx-1 h-5"
          />

          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              HR
            </div>

            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-none">
                HR Manager
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Recruitment
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default DashboardHeader;