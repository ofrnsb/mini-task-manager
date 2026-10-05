import { TASK_STATUSES, type TaskStatus } from '@mtm/shared';
import { Icon } from '../lib/icons';

/** A ring that fills one segment per step: to_do empty, done full with a check. */
export function StatusRing({ status, size = 26 }: { status: TaskStatus; size?: number }) {
  const step = TASK_STATUSES.indexOf(status);
  const fraction = step / (TASK_STATUSES.length - 1);
  const r = 10;
  const c = 2 * Math.PI * r;
  return (
    <span className={`ring ${status}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} className="ring-track" />
        <circle
          cx="12"
          cy="12"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          transform="rotate(-90 12 12)"
        />
      </svg>
      {status === 'done' && <Icon.check />}
    </span>
  );
}
