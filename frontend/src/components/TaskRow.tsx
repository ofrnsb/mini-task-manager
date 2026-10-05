import { nextStatus, type Task } from '@mtm/shared';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';
import { relativeTime } from '../lib/time';
import { StatusRing } from './StatusRing';

interface Props {
  task: Task;
  selected: boolean;
  busy: boolean;
  flash: boolean;
  onAdvance: () => void;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * Presentational. The UI only offers the next valid status; the API enforces it.
 * Secondary actions show on hover or keyboard focus (always on touch screens).
 */
export function TaskRow({ task, selected, busy, flash, onAdvance, onSelect, onDelete }: Props) {
  const next = nextStatus(task.status);

  return (
    <li
      className={`task ${selected ? 'selected' : ''} ${task.status === 'done' ? 'is-done' : ''} ${flash ? 'flash' : ''}`}
    >
      <button className="task-main" onClick={onSelect} aria-label={`Show history of ${task.title}`}>
        <StatusRing status={task.status} size={20} />
        <span className="task-text">
          <span className="task-title">{task.title}</span>
          {task.description && <span className="task-desc">{task.description}</span>}
        </span>
      </button>

      <span className="task-status">
        <span className={`pill ${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </span>
      <time className="task-updated" dateTime={task.updatedAt} title={task.updatedAt}>
        {relativeTime(task.updatedAt)}
      </time>

      <div className="task-actions">
        <span className="row-tools">
          <button className="icon-btn" onClick={onSelect} aria-label="Show history" title="History">
            <Icon.history />
          </button>
          <button
            className="icon-btn danger"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete task"
            title="Delete"
          >
            <Icon.trash />
          </button>
        </span>
        {next ? (
          <button className="btn btn-gray btn-sm" onClick={onAdvance} disabled={busy}>
            Move to {STATUS_LABEL[next]}
            <Icon.arrowRight />
          </button>
        ) : (
          <span className="completed">
            <Icon.check /> Completed
          </span>
        )}
      </div>
    </li>
  );
}
