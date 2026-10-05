import type { StaleStatusDetails } from '@mtm/shared';

// Domain failures carry a code and data, never an HTTP status.
// The HTTP layer decides how each one is presented (see http/app.ts).

export class TaskNotFoundError extends Error {
  readonly code = 'TASK_NOT_FOUND';
  constructor(readonly taskId: number) {
    super(`Task ${taskId} not found`);
  }
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION';
  constructor(message: string) {
    super(message);
  }
}

export class StaleStatusError extends Error {
  readonly code = 'STALE_STATUS';
  constructor(
    message: string,
    readonly details: StaleStatusDetails,
  ) {
    super(message);
  }
}

export type DomainError = TaskNotFoundError | InvalidTransitionError | StaleStatusError;
