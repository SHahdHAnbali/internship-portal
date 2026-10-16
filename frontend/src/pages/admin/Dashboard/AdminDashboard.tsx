import { ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AuditTrail from '@/features/admin/components/AuditTrail';
import { ErrorBox, Loading } from '@/features/admin/components/QueryState';
import { useAdminAuditEvents, useAdminOverview } from '@/features/admin/hooks/useAdmin';
import { ROLE_LABELS } from '@/features/admin/types';
import type { UserRole } from '@/features/auth/auth-context';

const ROLE_ORDER: UserRole[] = ['ADMIN', 'HR', 'MENTOR', 'INTERN', 'APPLICANT'];

export default function AdminDashboard() {
  const overview = useAdminOverview();
  const events = useAdminAuditEvents(8);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts and system configuration. Recruitment decisions stay with HR.
        </p>
      </div>

      {overview.isPending ? (
        <Loading />
      ) : overview.isError ? (
        <ErrorBox message={overview.error.message} onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={Users} label="All accounts" value={overview.data.users.total} />
            <Stat icon={UserCheck} label="Active" value={overview.data.users.active} />
            <Stat icon={UserX} label="Deactivated" value={overview.data.users.inactive} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Accounts by role</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Role</th>
                      <th className="pb-2 text-right font-medium">Active</th>
                      <th className="pb-2 text-right font-medium">Deactivated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_ORDER.map((role) => (
                      <tr key={role} className="border-t">
                        <td className="py-2">{ROLE_LABELS[role]}</td>
                        <td className="py-2 text-right">{overview.data.users.byRole[role]?.active ?? 0}</td>
                        <td className="py-2 text-right">{overview.data.users.byRole[role]?.inactive ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(overview.data.users.byRole.MENTOR?.active ?? 0) === 0 && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    There are no active Mentors yet, so HR cannot assign Mentors to placements.
                  </p>
                )}
                <Link to="/admin/users" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">Manage users</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5" />Recent account changes</CardTitle></CardHeader>
              <CardContent>
                {events.isPending ? <Loading /> : events.isError
                  ? <ErrorBox message={events.error.message} onRetry={() => void events.refetch()} />
                  : <AuditTrail events={events.data} />}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
