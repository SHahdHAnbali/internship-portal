import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getMyInternTasks,
  updateMyInternTaskStatus,
  withdrawMyInternTaskSubmission,
} from '../services/intern-tasks.service';

export const INTERN_TASKS_QUERY_KEY = ['intern', 'tasks'] as const;

export function useInternTasks() {
  return useQuery({
    queryKey: INTERN_TASKS_QUERY_KEY,
    queryFn: getMyInternTasks,
    retry: false,
  });
}

// Refreshes the task list after success and after a refusal (the task's state
// or deadline may have changed on the server).
export function useWithdrawInternTaskSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => withdrawMyInternTaskSubmission(taskId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: INTERN_TASKS_QUERY_KEY });
    },
  });
}

export function useUpdateInternTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status, note }: { taskId: string; status: 'IN_PROGRESS' | 'COMPLETED'; note: string | null }) =>
      updateMyInternTaskStatus(taskId, status, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: INTERN_TASKS_QUERY_KEY });
    },
  });
}
