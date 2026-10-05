import type {
  Actor,
  AuditChainReport,
  AuditLog,
  AuditLogQuery,
  ChangeStatusResponse,
  Task,
  TaskStatus,
} from '@mtm/shared';
import type { DB } from '../db/connection.js';
import { verifyChain } from '../domain/auditChain.js';
import { InvalidTransitionError, StaleStatusError, TaskNotFoundError } from '../domain/errors.js';
import { decideStatusChange } from '../domain/statusPolicy.js';
import { createAuditLogRepository } from '../repositories/auditLogRepository.js';
import { createTaskRepository } from '../repositories/taskRepository.js';

export interface Clock {
  now(): string; // ISO 8601, UTC
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

/**
 * Use cases. Owns transactions and turns domain decisions into writes.
 * A status change and its audit log commit together or not at all.
 */
export function createTaskService(db: DB, clock: Clock = systemClock) {
  const tasks = createTaskRepository(db);
  const auditLogs = createAuditLogRepository(db);

  // .immediate() takes the write lock at BEGIN, so another writer (another
  // process on the same file) cannot read the same status or chain head.
  const changeStatus = db.transaction(
    (id: number, requested: TaskStatus, actor: Actor, expected?: TaskStatus): ChangeStatusResponse => {
      const task = tasks.findActive(id);
      if (!task) throw new TaskNotFoundError(id);

      const decision = decideStatusChange(task.status, requested, expected);
      switch (decision.kind) {
        case 'noop':
          // lastChange tells the client who set it: them on a retry, or a teammate.
          return { task, changed: false, lastChange: auditLogs.lastForTask(id) };

        case 'stale': {
          const lastChange = auditLogs.lastForTask(id);
          throw new StaleStatusError(
            `Task is now "${decision.current}"${lastChange ? `, changed by ${lastChange.actor}` : ''}.`,
            { task, lastChange },
          );
        }

        case 'invalid':
          throw new InvalidTransitionError(decision.reason);

        case 'apply': {
          const at = clock.now();
          const updated = tasks.updateStatus(id, decision.to, at);
          const lastChange = auditLogs.append({
            taskId: id,
            taskTitle: task.title,
            actor,
            fromStatus: decision.from,
            toStatus: decision.to,
            createdAt: at,
          });
          return { task: updated, changed: true, lastChange };
        }
      }
    },
  ).immediate;

  return {
    list: (): Task[] => tasks.listActive(),

    create: (title: string, description: string): Task => tasks.insert(title, description, clock.now()),

    changeStatus,

    // Soft delete: the row stays so its audit logs keep a valid task_id.
    remove(id: number): void {
      if (!tasks.softDelete(id, clock.now())) throw new TaskNotFoundError(id);
    },

    // Works for deleted tasks too: history outlives the task.
    taskHistory(taskId: number): AuditLog[] {
      if (!tasks.exists(taskId)) throw new TaskNotFoundError(taskId);
      return auditLogs.search({ taskId });
    },

    searchLogs: (query: AuditLogQuery): AuditLog[] => auditLogs.search(query),

    verifyLogs: (): AuditChainReport => verifyChain(auditLogs.iterateAll()),
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
