import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createInternship,
  getHrInternships,
} from '../services/internships.service';
import type { Internship } from '../types';

export const hrInternshipsKey = ['hr', 'internships'] as const;
export const trainingPlanKey = ['hr', 'training-plan'] as const;

// HR list of training opportunities (used by the requirements page).
export function useInternships() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: hrInternshipsKey,
    queryFn: getHrInternships,
  });

  const create = useMutation({
    mutationFn: (title: string) => createInternship({ title }),
    onSuccess: async (internship) => {
      queryClient.setQueryData<Internship[]>(hrInternshipsKey, (current = []) => [internship, ...current]);
      await queryClient.invalidateQueries({ queryKey: trainingPlanKey });
    },
  });

  return {
    internships: list.data ?? [],
    isLoading: list.isPending,
    isCreating: create.isPending,
    error: list.error?.message ?? create.error?.message ?? null,
    addInternship: (title: string) => create.mutateAsync(title),
  };
}
