import { useState, type FormEvent } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminKey } from '@/features/admin/hooks/useAdmin';
import { changeUserRole, createStaffUser, setUserActive } from '@/features/admin/services/admin.service';
import { ROLE_LABELS, STAFF_ROLES, type AdminUser, type StaffRole } from '@/features/admin/types';

const NOTE_MAX = 1000;
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

const ROLE_HINTS: Record<StaffRole, string> = {
  HR: 'Recruitment: applications, decisions, training planning, placements and Mentor assignment.',
  MENTOR: 'Supervises the interns of placements HR assigns to them.',
  ADMIN: 'Accounts and system settings only — no recruitment or mentoring access.',
};

function useRefreshAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminKey });
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
      {message}
    </p>
  );
}

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useRefreshAdmin();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('MENTOR');
  const [created, setCreated] = useState<AdminUser | null>(null);

  const create = useMutation({
    mutationFn: () => createStaffUser({ email: email.trim().toLowerCase(), fullName: fullName.trim(), role }),
    onSuccess: async (user) => {
      setCreated(user);
      await refresh();
    },
  });

  function close() {
    if (create.isPending) return;
    setEmail('');
    setFullName('');
    setRole('MENTOR');
    setCreated(null);
    create.reset();
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!create.isPending && email.trim() && fullName.trim()) create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                {created.email} can now sign in as {ROLE_LABELS[created.role]} on the sign-in page with a one-time
                email link. No invitation email was sent — let them know the account is ready.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter><Button type="button" onClick={close}>Done</Button></DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add a staff account</DialogTitle>
              <DialogDescription>
                Creates a sign-in account for HR, a Mentor or another administrator. Applicant and intern
                accounts come from the application and placement workflow.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Full name <span className="text-destructive">*</span>
              <Input required maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={create.isPending} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Email <span className="text-destructive">*</span>
              <Input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={create.isPending} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Role
              <select className={selectClass} value={role} onChange={(event) => setRole(event.target.value as StaffRole)} disabled={create.isPending}>
                {STAFF_ROLES.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
              </select>
              <span className="block text-xs font-normal text-muted-foreground">{ROLE_HINTS[role]}</span>
            </label>
            {create.isError && <ErrorMessage message={create.error.message} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={create.isPending}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create account
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ChangeRoleDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const refresh = useRefreshAdmin();
  const [role, setRole] = useState<StaffRole | ''>('');
  const [note, setNote] = useState('');

  const change = useMutation({
    mutationFn: () => changeUserRole(user!.id, role as StaffRole, note.trim() || null),
    onSuccess: async () => {
      await refresh();
      close();
    },
  });

  function close() {
    if (change.isPending) return;
    setRole('');
    setNote('');
    change.reset();
    onClose();
  }

  const options = STAFF_ROLES.filter((option) => option !== user?.role);

  return (
    <Dialog open={user !== null} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="sm:max-w-lg">
        {user && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (role && !change.isPending) change.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Change role</DialogTitle>
              <DialogDescription>
                {user.fullName ?? user.email} is currently {ROLE_LABELS[user.role]}. The new role replaces it — roles
                do not combine.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              New role <span className="text-destructive">*</span>
              <select className={selectClass} value={role} onChange={(event) => setRole(event.target.value as StaffRole)} disabled={change.isPending} required>
                <option value="">Choose a role</option>
                {options.map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
              </select>
              {role && <span className="block text-xs font-normal text-muted-foreground">{ROLE_HINTS[role]}</span>}
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional, kept in the audit trail)</span>
              <Textarea rows={2} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} disabled={change.isPending} />
            </label>
            {change.isError && <ErrorMessage message={change.error.message} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={change.isPending}>Cancel</Button>
              <Button type="submit" disabled={!role || change.isPending}>
                {change.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Change role
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StatusDialog({
  user,
  onClose,
  onSyncWarning,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSyncWarning: (message: string) => void;
}) {
  const refresh = useRefreshAdmin();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const deactivating = user?.isActive ?? false;
  const noteMissing = deactivating && note.trim() === '';

  const update = useMutation({
    mutationFn: () => setUserActive(user!.id, !deactivating, note.trim() || null),
    onSuccess: async (result) => {
      if (!result.signInBlockSynced) {
        onSyncWarning(
          `${result.user.email}: the status was saved, but updating sign-in access failed. Repeat the action to retry.`,
        );
      }
      await refresh();
      close();
    },
  });

  function close() {
    if (update.isPending) return;
    setNote('');
    setTouched(false);
    update.reset();
    onClose();
  }

  return (
    <Dialog open={user !== null} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
      <DialogContent className="sm:max-w-lg">
        {user && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (!noteMissing && !update.isPending) update.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>{deactivating ? 'Deactivate this account?' : 'Reactivate this account?'}</DialogTitle>
              <DialogDescription>
                {deactivating
                  ? `${user.fullName ?? user.email} will immediately lose access to the portal and can no longer sign in. Their data is kept.`
                  : `${user.fullName ?? user.email} will be able to sign in again with their current role (${ROLE_LABELS[user.role]}).`}
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Reason {deactivating ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
              <Textarea
                rows={2}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-invalid={touched && noteMissing}
                disabled={update.isPending}
              />
              {touched && noteMissing && <span className="block text-xs font-normal text-destructive">A reason is required.</span>}
            </label>
            {update.isError && <ErrorMessage message={update.error.message} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={update.isPending}>Cancel</Button>
              <Button type="submit" variant={deactivating ? 'destructive' : 'default'} disabled={update.isPending}>
                {update.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {deactivating ? 'Deactivate' : 'Reactivate'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
