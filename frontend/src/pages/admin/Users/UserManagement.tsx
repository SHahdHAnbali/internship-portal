import { useDeferredValue, useState } from 'react';

import { Search, UserPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AuditTrail from '@/features/admin/components/AuditTrail';
import { ErrorBox, Loading } from '@/features/admin/components/QueryState';
import { formatDateTime } from '@/features/admin/format';
import { useAdminAuditEvents, useAdminUsers } from '@/features/admin/hooks/useAdmin';
import { ROLE_LABELS, STAFF_ROLES, type AdminUser, type AdminUserFilters } from '@/features/admin/types';
import { useAuth, type UserRole } from '@/features/auth/auth-context';

import { ChangeRoleDialog, CreateUserDialog, StatusDialog } from './UserDialogs';

const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm';
const ALL_ROLES: UserRole[] = ['ADMIN', 'HR', 'MENTOR', 'INTERN', 'APPLICANT'];

export default function UserManagement() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminUserFilters['role']>('');
  const [status, setStatus] = useState<AdminUserFilters['status']>('');
  const deferredSearch = useDeferredValue(search);
  const users = useAdminUsers({ search: deferredSearch, role, status });
  const events = useAdminAuditEvents(20);

  const [creating, setCreating] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">User management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add staff accounts, change staff roles and deactivate accounts. Every change is recorded.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><UserPlus className="mr-2 size-4" />Add staff account</Button>
      </div>

      {warning && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {warning}
          <Button variant="ghost" size="sm" onClick={() => setWarning(null)}>Dismiss</Button>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search by name or email" placeholder="Search by name or email" className="pl-9" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select aria-label="Filter by role" className={selectClass} value={role} onChange={(event) => setRole(event.target.value as AdminUserFilters['role'])}>
              <option value="">All roles</option>
              {ALL_ROLES.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
            </select>
            <select aria-label="Filter by status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as AdminUserFilters['status'])}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </div>

          {users.isPending ? <Loading /> : users.isError ? (
            <ErrorBox message={users.error.message} onRetry={() => void users.refetch()} />
          ) : users.data.users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No accounts match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Last sign-in</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.users.map((account) => {
                    const isSelf = account.id === me?.id;
                    const isStaff = (STAFF_ROLES as UserRole[]).includes(account.role);
                    return (
                      <tr key={account.id} className="border-b last:border-0">
                        <td className="py-3 pr-3">
                          <p className="font-medium">{account.fullName ?? '—'}{isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</p>
                          <p className="text-xs text-muted-foreground">{account.email}</p>
                        </td>
                        <td className="py-3 pr-3"><Badge variant="outline">{ROLE_LABELS[account.role]}</Badge></td>
                        <td className="py-3 pr-3">
                          {account.isActive
                            ? <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                            : <span className="text-muted-foreground" title={`Since ${formatDateTime(account.deactivatedAt)}`}>Deactivated</span>}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{formatDateTime(account.lastSignInAt)}</td>
                        <td className="py-3 text-right">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">Your own account</span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {isStaff && (
                                <Button variant="outline" size="sm" onClick={() => setRoleTarget(account)}>Change role</Button>
                              )}
                              <Button variant={account.isActive ? 'ghost' : 'outline'} size="sm" onClick={() => setStatusTarget(account)}>
                                {account.isActive ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Applicant and intern roles follow the application and placement workflow and cannot be changed here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Audit trail</CardTitle></CardHeader>
        <CardContent>
          {events.isPending ? <Loading /> : events.isError
            ? <ErrorBox message={events.error.message} onRetry={() => void events.refetch()} />
            : <AuditTrail events={events.data} />}
        </CardContent>
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <ChangeRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
      <StatusDialog user={statusTarget} onClose={() => setStatusTarget(null)} onSyncWarning={setWarning} />
    </div>
  );
}
