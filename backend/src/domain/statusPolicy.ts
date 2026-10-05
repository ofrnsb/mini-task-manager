import { nextStatus, type TaskStatus } from '@mtm/shared';

export type StatusDecision =
  | { kind: 'noop' }
  | { kind: 'apply'; from: TaskStatus; to: TaskStatus }
  | { kind: 'stale'; current: TaskStatus }
  | { kind: 'invalid'; reason: string };

/**
 * Decides what a status change request means, given the task's current status.
 * Pure: no I/O, so every combination is unit-tested in statusPolicy.test.ts.
 *
 * Order matters:
 * 1. Same status → noop. Retries and double clicks succeed without a new log.
 * 2. Client saw a different status → stale. Tell them instead of guessing.
 * 3. Not the next step → invalid. Only to_do → pending → in_progress → done.
 */
export function decideStatusChange(current: TaskStatus, requested: TaskStatus, expected?: TaskStatus): StatusDecision {
  if (current === requested) return { kind: 'noop' };
  if (expected !== undefined && expected !== current) return { kind: 'stale', current };

  const next = nextStatus(current);
  if (requested !== next) {
    return {
      kind: 'invalid',
      reason:
        `Cannot move task from "${current}" to "${requested}". ` +
        (next ? `Next allowed status is "${next}".` : 'Task is already done.'),
    };
  }
  return { kind: 'apply', from: current, to: requested };
}
