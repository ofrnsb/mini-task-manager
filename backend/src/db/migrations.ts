import { TASK_STATUSES } from '@mtm/shared';
import type { DB } from './connection.js';

// Schema changes are append-only, like the audit log: never edit a shipped
// migration, add a new one. PRAGMA user_version records how many have run.

const statuses = TASK_STATUSES.map((s) => `'${s}'`).join(', ');

export const MIGRATIONS: readonly string[] = [
  // 1: tasks, append-only audit log with hash chain
  `
  CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL CHECK (status IN (${statuses})),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  CREATE TABLE audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id      INTEGER NOT NULL REFERENCES tasks(id),
    task_title   TEXT NOT NULL,
    actor        TEXT NOT NULL,
    from_status  TEXT NOT NULL CHECK (from_status IN (${statuses})),
    to_status    TEXT NOT NULL CHECK (to_status IN (${statuses})),
    created_at   TEXT NOT NULL,
    prev_hash    TEXT NOT NULL,
    hash         TEXT NOT NULL UNIQUE
  );

  CREATE INDEX idx_audit_logs_task ON audit_logs (task_id, id);
  CREATE INDEX idx_audit_logs_actor ON audit_logs (actor, id);

  -- Append-only: the database refuses to edit or remove a log row,
  -- no matter which code path (or a manual sqlite3 session) tries it.
  CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;

  CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
  `,
];

export function migrate(db: DB, migrations: readonly string[] = MIGRATIONS): void {
  const current = db.pragma('user_version', { simple: true }) as number;

  if (current === 0) {
    const tables = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
      .get() as {
      n: number;
    };
    if (tables.n > 0) {
      throw new Error('Database has tables but no schema version. It predates migrations; delete it and restart.');
    }
  }
  if (current > migrations.length) {
    throw new Error(`Database schema v${current} is newer than this build (v${migrations.length}).`);
  }

  for (let version = current + 1; version <= migrations.length; version++) {
    db.transaction(() => {
      db.exec(migrations[version - 1]);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
