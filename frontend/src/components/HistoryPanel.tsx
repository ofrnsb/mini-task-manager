import type { Task } from '@mtm/shared';
import { useTaskHistory } from '../api/hooks';
import { formatTime } from '../lib/format';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Dialog } from './Dialog';
import { LogEntry } from './LogEntry';
import { StatusRing } from './StatusRing';

function Timeline({ task }: { task: Task }) {
  const { data: logs, error, isPending } = useTaskHistory(task.id);

  if (error) return <p className="alert">{error.message}</p>;
  if (isPending) return <div className="skeleton-row tall" aria-label="Loading history" />;

  // The API returns logs oldest first. The creation point is the timeline's start.
  return (
    <ol className="timeline" aria-label="Status changes">
      <li className="log-item origin">
        <span className="dot" />
        <div className="entry">
          <span className="footnote">Created as To do · {formatTime(task.createdAt)}</span>
        </div>
      </li>
      {logs.map((log) => (
        <LogEntry key={log.id} log={log} />
      ))}
      {logs.length === 0 && <li className="footnote timeline-empty">No status changes yet.</li>}
    </ol>
  );
}

/**
 * Wide screens: a non-modal inspector beside the list, so selecting another
 * task just switches it. Smaller screens: a modal sheet.
 */
export function HistoryPanel({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const wide = useMediaQuery('(min-width: 1280px)');
  if (!task) return null;

  return (
    <Dialog
      key={wide ? 'inspector' : 'sheet'}
      modal={!wide}
      onClose={onClose}
      className="inspector"
      labelledBy="history-title"
    >
      <div className="sheet-grip" aria-hidden="true" />
      <header className="inspector-head">
        <div>
          <p className="eyebrow">History</p>
          <h2 id="history-title">{task.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close history">
          <Icon.close />
        </button>
      </header>
      <div className="inspector-meta">
        <StatusRing status={task.status} size={28} />
        <div>
          <span className={`pill ${task.status}`}>{STATUS_LABEL[task.status]}</span>
          {task.description && <p className="inspector-desc">{task.description}</p>}
        </div>
      </div>
      <Timeline task={task} />
    </Dialog>
  );
}
