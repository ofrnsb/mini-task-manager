import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type TaskStatus } from '@mtm/shared';
import { decideStatusChange } from '../src/domain/statusPolicy.js';

const ALLOWED: [TaskStatus, TaskStatus][] = [
  ['to_do', 'pending'],
  ['pending', 'in_progress'],
  ['in_progress', 'done'],
];

describe('decideStatusChange', () => {
  // Every (current, requested) pair: 4 × 4 = 16 cases, no expectedStatus.
  for (const current of TASK_STATUSES) {
    for (const requested of TASK_STATUSES) {
      const kind =
        current === requested
          ? 'noop'
          : ALLOWED.some(([f, t]) => f === current && t === requested)
            ? 'apply'
            : 'invalid';
      it(`${current} → ${requested} is ${kind}`, () => {
        expect(decideStatusChange(current, requested).kind).toBe(kind);
      });
    }
  }

  it('names the next allowed status when rejecting', () => {
    expect(decideStatusChange('to_do', 'done')).toEqual({
      kind: 'invalid',
      reason: 'Cannot move task from "to_do" to "done". Next allowed status is "pending".',
    });
    expect(decideStatusChange('done', 'to_do')).toMatchObject({ reason: expect.stringContaining('already done') });
  });

  it('applies when expectedStatus matches', () => {
    expect(decideStatusChange('pending', 'in_progress', 'pending')).toEqual({
      kind: 'apply',
      from: 'pending',
      to: 'in_progress',
    });
  });

  it('reports stale when the client saw a different status', () => {
    expect(decideStatusChange('in_progress', 'pending', 'to_do')).toEqual({ kind: 'stale', current: 'in_progress' });
  });

  it('treats a repeat as noop even with an outdated expectedStatus (retry after timeout)', () => {
    expect(decideStatusChange('pending', 'pending', 'to_do')).toEqual({ kind: 'noop' });
  });
});
