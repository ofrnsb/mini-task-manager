import type { TaskStatus } from '@mtm/shared';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  to_do: 'To do',
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
};
