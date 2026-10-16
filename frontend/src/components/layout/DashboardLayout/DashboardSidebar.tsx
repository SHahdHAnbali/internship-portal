import {
    BarChart3,
    BriefcaseBusiness,
    CalendarDays,
    FileText,
    LayoutDashboard,
    Users,
  } from 'lucide-react';
  import { Link, useLocation } from 'react-router-dom';
  
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
  } from '@/components/ui/sidebar';
  
  const mainNavigation = [
    {
      title: 'Overview',
      href: '/hr/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: 'Applications',
      href: '/hr/applications',
      icon: FileText,
    },
    {
      title: 'Candidates',
      href: '/hr/candidates',
      icon: Users,
    },
    {
      title: 'Internships',
      href: '/hr/internships',
      icon: BriefcaseBusiness,
    },
  ];
  
  const recruitmentNavigation = [
    {
      title: 'Interviews',
      href: '/hr/interviews',
      icon: CalendarDays,
    },
    {
      title: 'Reports',
      href: '/hr/reports',
      icon: BarChart3,
    },
  ];
  
  function DashboardSidebar() {
    const location = useLocation();
  
    return (
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Internship Portal"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  IP
                </div>
  
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    Internship Portal
                  </span>
  
                  <span className="truncate text-xs text-muted-foreground">
                    HR Management
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
  
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              Recruitment
            </SidebarGroupLabel>
  
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavigation.map((item) => {
                  const isActive = location.pathname === item.href;
  
                  return (
                    <SidebarMenuButton
  render={<Link to={item.href} />}
  isActive={isActive}
  tooltip={item.title}
>
  <item.icon />
  <span>{item.title}</span>
</SidebarMenuButton>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
  
          <SidebarGroup>
            <SidebarGroupLabel>
              Management
            </SidebarGroupLabel>
  
            <SidebarGroupContent>
              <SidebarMenu>
                {recruitmentNavigation.map((item) => {
                  const isActive = location.pathname === item.href;
  
                  return (
                    <SidebarMenuButton
  render={<Link to={item.href} />}
  isActive={isActive}
  tooltip={item.title}
>
  <item.icon />
  <span>{item.title}</span>
</SidebarMenuButton>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
  
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="HR Account">
                <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  HR
                </div>
  
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    HR Manager
                  </span>
  
                  <span className="truncate text-xs text-muted-foreground">
                    Recruitment
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    );
  }
  
  export default DashboardSidebar;