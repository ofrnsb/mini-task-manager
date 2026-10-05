import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { StaleStatusDetailsSchema, type Actor, type AuditLogQuery, type Task, type TaskStatus } from '@mtm/shared';
import { api, ApiRequestError } from './client';

// Server state lives in the query cache. Keys are per resource and filter, so
// a late response for task A can never land in task B's panel.
export const queryKeys = {
  tasks: ['tasks'] as const,
  auditLogs: ['audit-logs'] as const,
  history: (taskId: number) => ['audit-logs', 'task', taskId] as const,
  activity: (query: AuditLogQuery) => ['audit-logs', 'search', query] as const,
  chain: ['audit-logs', 'verify'] as const,
};

/** Teammates' changes show up within this interval; paused while the tab is hidden. */
export const POLL_MS = 10_000;

export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: ({ signal }) => api.listTasks(signal),
    refetchInterval: POLL_MS,
  });
}

export function useTaskHistory(taskId: number) {
  return useQuery({
    queryKey: queryKeys.history(taskId),
    queryFn: ({ signal }) => api.taskHistory(taskId, signal),
    refetchInterval: POLL_MS,
  });
}

export function useActivity(query: AuditLogQuery) {
  return useQuery({
    queryKey: queryKeys.activity(query),
    queryFn: ({ signal }) => api.searchLogs(query, signal),
    refetchInterval: POLL_MS,
  });
}

export function useChainReport() {
  return useQuery({ queryKey: queryKeys.chain, queryFn: ({ signal }) => api.verifyLogs(signal) });
}

const replaceTask = (qc: QueryClient, task: Task) =>
  qc.setQueryData<Task[]>(queryKeys.tasks, (ts) => ts?.map((t) => (t.id === task.id ? task : t)));

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: (task) => qc.setQueryData<Task[]>(queryKeys.tasks, (ts) => [...(ts ?? []), task]),
  });
}

export function useChangeStatus(actor: Actor) {
  const qc = useQueryClient();
  return useMutation({
    // `from` is the status the user is looking at; the API uses it to detect stale clicks.
    mutationFn: ({ task, to }: { task: Task; to: TaskStatus }) => api.changeStatus(task.id, to, actor, task.status),
    onSuccess: (res) => replaceTask(qc, res.task),
    onError: (err) => {
      // The server sends the current task with a stale rejection: resync the row.
      if (err instanceof ApiRequestError && err.code === 'STALE_STATUS') {
        const details = StaleStatusDetailsSchema.safeParse(err.details);
        if (details.success) replaceTask(qc, details.data.task);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.auditLogs }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: (_, id) => qc.setQueryData<Task[]>(queryKeys.tasks, (ts) => ts?.filter((t) => t.id !== id)),
  });
}
