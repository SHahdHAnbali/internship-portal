import InternLayout from '@/components/layout/InternLayout/InternLayout';
import RoleGuard from '@/features/auth/RoleGuard';

export default function InternRoute() {
  return (
    <RoleGuard allowedRoles={['INTERN']}>
      <InternLayout />
    </RoleGuard>
  );
}
