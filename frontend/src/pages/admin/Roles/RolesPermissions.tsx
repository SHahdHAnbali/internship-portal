import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBox, Loading } from '@/features/admin/components/QueryState';
import { useAdminOverview } from '@/features/admin/hooks/useAdmin';
import { ROLE_LABELS } from '@/features/admin/types';
import type { UserRole } from '@/features/auth/auth-context';

// What each role can do, as enforced by the backend guards and database
// functions. Roles do not combine: each account has exactly one.
const ROLES: { role: UserRole; assigned: string; can: string[] }[] = [
  {
    role: 'ADMIN',
    assigned: 'By another administrator (the first one by a one-time setup command).',
    can: [
      'Add HR, Mentor and Admin accounts',
      'Change roles between HR, Mentor and Admin',
      'Deactivate and reactivate accounts',
      'View the account audit trail and system configuration status',
    ],
  },
  {
    role: 'HR',
    assigned: 'By an administrator.',
    can: [
      'Review submitted applications, CVs and status history',
      'Move applications through stages, select or reject (final decisions)',
      'Plan training opportunities and seats; link requested trainings',
      'Schedule, activate and cancel placements; assign Mentors',
      'Export the application list',
    ],
  },
  {
    role: 'MENTOR',
    assigned: 'By an administrator. HR then assigns them to placements.',
    can: [
      'See only the placements HR assigned to them',
      'Review the weekly reports of interns in their placements',
    ],
  },
  {
    role: 'INTERN',
    assigned: 'Automatically, when HR activates the applicant’s placement.',
    can: [
      'See their own active placement',
      'Write and submit their own weekly reports',
    ],
  },
  {
    role: 'APPLICANT',
    assigned: 'Automatically, when an applicant submits their reviewed application.',
    can: [
      'Review and submit their own application',
      'See and edit their own profile and application statuses',
    ],
  },
];

export default function RolesPermissions() {
  const overview = useAdminOverview();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Roles & permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each account has exactly one role. Permissions are enforced by the server; administrators do not
          inherit HR, Mentor or Intern access.
        </p>
      </div>

      {overview.isPending && <Loading />}
      {overview.isError && <ErrorBox message={overview.error.message} onRetry={() => void overview.refetch()} />}

      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map(({ role, assigned, can }) => {
          const counts = overview.data?.users.byRole[role];
          return (
            <Card key={role}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-lg">
                  {ROLE_LABELS[role]}
                  {counts && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {counts.active} active{counts.inactive > 0 ? ` · ${counts.inactive} deactivated` : ''}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="list-disc space-y-1 pl-5">
                  {can.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="text-muted-foreground"><span className="font-medium text-foreground">Assigned:</span> {assigned}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
