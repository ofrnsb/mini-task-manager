import { useState } from 'react';
import { TASK_STATUSES, USERS, type Actor, type AuditChainReport, type AuditLog } from '@mtm/shared';
import { useActivity, useChainReport } from '../api/hooks';
import { Avatar } from '../components/Avatar';
import { LogEntry } from '../components/LogEntry';
import { Icon } from '../lib/icons';
import { STATUS_LABEL } from '../lib/status';
import { dayLabel } from '../lib/time';

function IntegrityCard({
  report,
  checking,
  onVerify,
}: {
  report?: AuditChainReport;
  checking: boolean;
  onVerify: () => void;
}) {
  const state = !report || checking ? '' : report.valid ? 'ok' : 'broken';
  return (
    <section className={`card integrity ${state}`} aria-live="polite">
      <div className="integrity-head">
        <span className="integrity-icon">{state === 'broken' ? <Icon.alert /> : <Icon.shield />}</span>
        <div>
          <p className="eyebrow">Log integrity</p>
          <h2>{state === '' ? 'Checking…' : state === 'ok' ? 'Chain Intact' : 'Chain Broken'}</h2>
        </div>
      </div>
      {report?.valid && (
        <p className="muted small">
          {report.checked} {report.checked === 1 ? 'entry' : 'entries'} verified. Each entry stores the SHA-256 hash of
          the one before it, so an edit made directly in the database breaks the chain.
        </p>
      )}
      {report?.brokenAt && (
        <p className="small">
          Entry #{report.brokenAt.id}: {report.brokenAt.reason}. The {report.checked} entries before it are intact.
        </p>
      )}
      {report?.headHash && (
        <div className="head-hash">
          <span className="muted small">Latest hash</span>
          <code title={report.headHash}>{report.headHash.slice(0, 24)}…</code>
        </div>
      )}
      <button className="btn btn-tinted btn-sm" onClick={onVerify} disabled={checking}>
        <Icon.refresh /> Verify Again
      </button>
    </section>
  );
}

/** Who moved what: one stacked bar per user, split by the status they moved tasks into. */
function ContributorsCard({ logs }: { logs: AuditLog[] }) {
  const rows = USERS.map((user) => {
    const mine = logs.filter((l) => l.actor === user);
    return {
      user,
      total: mine.length,
      byStatus: TASK_STATUSES.map((s) => mine.filter((l) => l.toStatus === s).length),
    };
  }).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section className="card contributors">
      <h2 className="card-title">Who Moved What</h2>
      <ul>
        {rows.map((r) => (
          <li key={r.user}>
            <Avatar name={r.user} size={28} />
            <div className="contrib-body">
              <div className="contrib-head">
                <span>{r.user}</span>
                <strong>{r.total}</strong>
              </div>
              <div className="stack" style={{ width: `${(r.total / max) * 100}%` }}>
                {TASK_STATUSES.map((s, i) =>
                  r.byStatus[i] ? (
                    <span
                      key={s}
                      className={`seg ${s}`}
                      style={{ flex: r.byStatus[i] }}
                      title={`${r.byStatus[i]} → ${STATUS_LABEL[s]}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="legend">
        {TASK_STATUSES.slice(1).map((s) => (
          <span key={s}>
            <i className={`seg ${s}`} /> to {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Splits oldest-first logs into consecutive day groups, keeping chronological order. */
function groupByDay(logs: AuditLog[]): { day: string; logs: AuditLog[] }[] {
  const groups: { day: string; logs: AuditLog[] }[] = [];
  for (const log of logs) {
    const day = dayLabel(log.createdAt);
    if (groups.at(-1)?.day === day) groups.at(-1)!.logs.push(log);
    else groups.push({ day, logs: [log] });
  }
  return groups;
}

export function ActivityView() {
  const [actor, setActor] = useState<Actor | ''>('');
  const { data: logs, error, isPending } = useActivity({ actor: actor || undefined });
  const all = useActivity({});
  const chain = useChainReport();
  const failure = error ?? chain.error;

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="subtitle">Every status change, oldest first</p>
        </div>
      </header>

      {failure && <div className="alert">{failure.message}</div>}

      <div className="activity-grid">
        <section className="feed" aria-label="Status changes">
          <div className="feed-toolbar">
            <span className="footnote">
              {logs ? `${logs.length} ${logs.length === 1 ? 'change' : 'changes'}` : 'Loading…'}
            </span>
            <label className="popup compact">
              {actor ? <Avatar name={actor} size={20} /> : <Icon.user />}
              <select
                value={actor}
                onChange={(e) => setActor(e.target.value as Actor | '')}
                aria-label="Filter by user"
              >
                <option value="">All Users</option>
                {USERS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
          {isPending ? (
            <div className="skeleton-row tall" aria-label="Loading activity" />
          ) : !logs?.length ? (
            <div className="empty group">
              <span className="empty-icon">
                <Icon.activity />
              </span>
              <h2>No Activity</h2>
              <p>Status changes{actor ? ` by ${actor}` : ''} will appear here.</p>
            </div>
          ) : (
            groupByDay(logs).map((g) => (
              <section key={g.day} className="day-group">
                <h3 className="group-header">{g.day}</h3>
                <ol className="group feed-list" aria-label={`Status changes, ${g.day}`}>
                  {g.logs.map((log) => (
                    <LogEntry key={log.id} log={log} showTask />
                  ))}
                </ol>
              </section>
            ))
          )}
        </section>

        <div className="side-stack">
          <IntegrityCard report={chain.data} checking={chain.isFetching} onVerify={() => chain.refetch()} />
          {all.data && all.data.length > 0 && <ContributorsCard logs={all.data} />}
        </div>
      </div>
    </main>
  );
}
