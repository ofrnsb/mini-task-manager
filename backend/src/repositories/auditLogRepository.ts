import type { Actor, AuditLog, AuditLogQuery, TaskStatus } from '@mtm/shared';
import type { DB } from '../db/connection.js';
import { GENESIS_HASH, hashEntry } from '../domain/auditChain.js';

interface AuditLogRow {
  id: number;
  task_id: number;
  task_title: string;
  actor: Actor;
  from_status: TaskStatus;
  to_status: TaskStatus;
  created_at: string;
  prev_hash: string;
  hash: string;
}

const toAuditLog = (r: AuditLogRow): AuditLog => ({
  id: r.id,
  taskId: r.task_id,
  taskTitle: r.task_title,
  actor: r.actor,
  fromStatus: r.from_status,
  toStatus: r.to_status,
  createdAt: r.created_at,
  prevHash: r.prev_hash,
  hash: r.hash,
});

export type NewAuditLog = Omit<AuditLog, 'id' | 'prevHash' | 'hash'>;

/**
 * Append and read only. There is deliberately no update or delete here,
 * and the table's triggers reject them anyway.
 */
export function createAuditLogRepository(db: DB) {
  const stmts = {
    head: db.prepare<[], { hash: string }>('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1'),
    insert: db.prepare<[Record<string, unknown>], AuditLogRow>(
      `INSERT INTO audit_logs (task_id, task_title, actor, from_status, to_status, created_at, prev_hash, hash)
       VALUES (@taskId, @taskTitle, @actor, @fromStatus, @toStatus, @createdAt, @prevHash, @hash)
       RETURNING *`,
    ),
    lastForTask: db.prepare<[number], AuditLogRow>(
      'SELECT * FROM audit_logs WHERE task_id = ? ORDER BY id DESC LIMIT 1',
    ),
    all: db.prepare<[], AuditLogRow>('SELECT * FROM audit_logs ORDER BY id'),
    byActor: db.prepare<[Actor], AuditLogRow>('SELECT * FROM audit_logs WHERE actor = ? ORDER BY id'),
    byTask: db.prepare<[number], AuditLogRow>('SELECT * FROM audit_logs WHERE task_id = ? ORDER BY id'),
    byTaskAndActor: db.prepare<[number, Actor], AuditLogRow>(
      'SELECT * FROM audit_logs WHERE task_id = ? AND actor = ? ORDER BY id',
    ),
  };

  function select(query: AuditLogQuery): AuditLogRow[] {
    const { taskId, actor } = query;
    if (taskId && actor) return stmts.byTaskAndActor.all(taskId, actor);
    if (taskId) return stmts.byTask.all(taskId);
    if (actor) return stmts.byActor.all(actor);
    return stmts.all.all();
  }

  return {
    /**
     * Must run inside the caller's write transaction: reading the chain head
     * and inserting the next row has to be atomic, or two rows share a parent.
     */
    append(entry: NewAuditLog): AuditLog {
      if (!db.inTransaction) throw new Error('auditLogs.append must run inside a transaction');
      const prevHash = stmts.head.get()?.hash ?? GENESIS_HASH;
      const hash = hashEntry(prevHash, entry);
      return toAuditLog(stmts.insert.get({ ...entry, prevHash, hash })!);
    },
    lastForTask: (taskId: number): AuditLog | null => {
      const row = stmts.lastForTask.get(taskId);
      return row ? toAuditLog(row) : null;
    },
    /** Oldest first, as the brief requires. */
    search: (query: AuditLogQuery): AuditLog[] => select(query).map(toAuditLog),
    /** Streams rows so verification never holds the whole table in memory. */
    *iterateAll(): Generator<AuditLog> {
      for (const row of stmts.all.iterate()) yield toAuditLog(row);
    },
  };
}

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>;
