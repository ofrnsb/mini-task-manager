import type { Task, TaskStatus } from '@mtm/shared';
import type { DB } from '../db/connection.js';

interface TaskRow {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** SQL for tasks. No business rules here; callers own transactions. */
export function createTaskRepository(db: DB) {
  const stmts = {
    listActive: db.prepare<[], TaskRow>('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY id'),
    findActive: db.prepare<[number], TaskRow>('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL'),
    exists: db.prepare<[number], { found: 1 }>('SELECT 1 AS found FROM tasks WHERE id = ?'),
    insert: db.prepare<[string, string, string, string], TaskRow>(
      `INSERT INTO tasks (title, description, status, created_at, updated_at)
       VALUES (?, ?, 'to_do', ?, ?) RETURNING *`,
    ),
    updateStatus: db.prepare<[TaskStatus, string, number], TaskRow>(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? RETURNING *',
    ),
    softDelete: db.prepare<[string, string, number]>(
      'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    ),
  };

  return {
    listActive: (): Task[] => stmts.listActive.all().map(toTask),
    findActive: (id: number): Task | null => {
      const row = stmts.findActive.get(id);
      return row ? toTask(row) : null;
    },
    /** True for deleted tasks too: their history is still readable. */
    exists: (id: number): boolean => stmts.exists.get(id) !== undefined,
    insert: (title: string, description: string, at: string): Task =>
      toTask(stmts.insert.get(title, description, at, at)!),
    updateStatus: (id: number, status: TaskStatus, at: string): Task => toTask(stmts.updateStatus.get(status, at, id)!),
    /** Returns false when the task does not exist or is already deleted. */
    softDelete: (id: number, at: string): boolean => stmts.softDelete.run(at, at, id).changes === 1,
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
