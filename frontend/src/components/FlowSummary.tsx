import type { ReactNode } from 'react';
import { TASK_STATUSES, type Task, type TaskStatus } from '@mtm/shared';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';

const ICON: Record<TaskStatus, () => ReactNode> = {
  to_do: Icon.circle,
  pending: Icon.clock,
  in_progress: Icon.progress,
  done: Icon.checkCircle,
};

interface Props {
  tasks: Task[];
  active: TaskStatus | 'all';
  onSelect: (status: TaskStatus | 'all') => void;
}

/** One tile per status, in flow order, like Reminders' smart lists. Selecting one filters the list. */
export function FlowSummary({ tasks, active, onSelect }: Props) {
  return (
    <section className="tiles" aria-label="Tasks by status">
      {TASK_STATUSES.map((s) => {
        const StatusIcon = ICON[s];
        const count = tasks.filter((t) => t.status === s).length;
        return (
          <button
            key={s}
            className={`tile ${s} ${active === s ? 'active' : ''}`}
            aria-pressed={active === s}
            onClick={() => onSelect(active === s ? 'all' : s)}
          >
            <span className="tile-top">
              <span className="tile-icon">
                <StatusIcon />
              </span>
              <span className="tile-count">{count}</span>
            </span>
            <span className="tile-label">{STATUS_LABEL[s]}</span>
          </button>
        );
      })}
    </section>
  );
}
