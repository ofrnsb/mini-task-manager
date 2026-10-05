import { createHash } from 'node:crypto';
import type { AuditChainReport } from '@mtm/shared';

// Every log row stores the hash of the row before it (across all tasks), so
// editing, deleting or reordering a row directly in the DB file breaks the
// chain from that row onward. The triggers in db/migrations.ts stop edits
// through SQLite; this detects edits that bypass them.
//
// Limit: someone with file access can recompute the whole chain. Detecting
// that needs the head hash recorded outside this database.

export const GENESIS_HASH = '0'.repeat(64);

export interface ChainFields {
  taskId: number;
  taskTitle: string;
  actor: string;
  fromStatus: string;
  toStatus: string;
  createdAt: string;
}

export interface ChainRow extends ChainFields {
  id: number;
  prevHash: string;
  hash: string;
}

export function hashEntry(prevHash: string, f: ChainFields): string {
  // A JSON array fixes field order and escapes separators inside values.
  const payload = JSON.stringify([prevHash, f.taskId, f.taskTitle, f.actor, f.fromStatus, f.toStatus, f.createdAt]);
  return createHash('sha256').update(payload).digest('hex');
}

/** Walks rows in id order. Accepts an iterator so the table is never loaded whole. */
export function verifyChain(rows: Iterable<ChainRow>): AuditChainReport {
  let expectedPrev = GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return broken(checked, row.id, 'previous entry is missing or was changed');
    }
    if (hashEntry(row.prevHash, row) !== row.hash) {
      return broken(checked, row.id, 'entry content was changed');
    }
    expectedPrev = row.hash;
    checked++;
  }
  return { valid: true, checked, headHash: checked ? expectedPrev : null };
}

function broken(checked: number, id: number, reason: string): AuditChainReport {
  return { valid: false, checked, headHash: null, brokenAt: { id, reason } };
}
