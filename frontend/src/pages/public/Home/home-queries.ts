import { useQuery } from '@tanstack/react-query';

import { getApplicationIntake } from '@/features/applications/services/applications.service';
import { getInternships } from '@/features/internships/services/internships.service';

// Public data shown on the homepage, from the same endpoints as the
// Internships and Apply pages. Nothing here is required to use the page:
// each section shows its own loading, error and empty states.

export function usePublicInternships() {
  return useQuery({
    queryKey: ['public', 'internships'],
    queryFn: async () => (await getInternships()).filter((internship) => internship.isActive),
    staleTime: 60_000,
  });
}

// Whether the portal currently accepts new applications (ADMIN setting).
export function useApplicationIntake() {
  return useQuery({
    queryKey: ['public', 'application-intake'],
    queryFn: getApplicationIntake,
    staleTime: 60_000,
  });
}
