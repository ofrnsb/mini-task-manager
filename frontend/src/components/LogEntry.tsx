import type { AuditLog } from '@mtm/shared';
import { formatTime } from '../lib/format';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';
import { relativeTime } from '../lib/time';
import { Avatar } from './Avatar';

/** One audit log row as a timeline item, including the sentence format from the brief. */
export function LogEntry({ log, showTask = false }: { log: AuditLog; showTask?: boolean }) {
  return (
    <li className={`log-item to-${log.toStatus}`}>
      <span className="dot" />
      <div className="entry">
        <div className="entry-head">
          <span className="entry-who">
            <Avatar name={log.actor} size={24} />
            <strong>{log.actor}</strong>
          </span>
          <time dateTime={log.createdAt} title={formatTime(log.createdAt)}>
            {relativeTime(log.createdAt)}
          </time>
        </div>
        {showTask && <p className="entry-task">{log.taskTitle}</p>}
        <div className="transition">
          <span className={`pill ${log.fromStatus}`}>{STATUS_LABEL[log.fromStatus]}</span>
          <Icon.arrowRight />
          <span className={`pill ${log.toStatus}`}>{STATUS_LABEL[log.toStatus]}</span>
        </div>
        <p className="sentence">
          User "{log.actor}" changed Task "{log.taskTitle}" status from "{log.fromStatus}" to "{log.toStatus}" at{' '}
          {formatTime(log.createdAt)}
        </p>
        <p className="hash" title={`sha256 ${log.hash}\nprev ${log.prevHash}`}>
          #{log.id} · {log.hash.slice(0, 12)}
        </p>
      </div>
    </li>
  );
}
