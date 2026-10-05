import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, hashEntry, verifyChain, type ChainRow } from '../src/domain/auditChain.js';

function chain(n: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prevHash = GENESIS_HASH;
  for (let id = 1; id <= n; id++) {
    const fields = {
      taskId: 1,
      taskTitle: 'T',
      actor: 'john.doe',
      fromStatus: 'to_do',
      toStatus: 'pending',
      createdAt: `2025-01-01T10:00:0${id}.000Z`,
    };
    const hash = hashEntry(prevHash, fields);
    rows.push({ id, ...fields, prevHash, hash });
    prevHash = hash;
  }
  return rows;
}

describe('audit chain', () => {
  it('accepts an empty and an intact chain', () => {
    expect(verifyChain([])).toEqual({ valid: true, checked: 0, headHash: null });
    const rows = chain(3);
    expect(verifyChain(rows)).toEqual({ valid: true, checked: 3, headHash: rows[2].hash });
  });

  it('hashes deterministically and depends on every field', () => {
    const [row] = chain(1);
    expect(hashEntry(row.prevHash, row)).toBe(row.hash);
    expect(hashEntry(row.prevHash, { ...row, actor: 'jane.smith' })).not.toBe(row.hash);
    expect(hashEntry(row.prevHash, { ...row, taskTitle: 'T2' })).not.toBe(row.hash);
  });

  it('is not fooled by moving text between fields', () => {
    const a = { taskId: 1, taskTitle: 'ab', actor: 'c', fromStatus: 'to_do', toStatus: 'pending', createdAt: 'x' };
    const b = { ...a, taskTitle: 'a', actor: 'bc' };
    expect(hashEntry(GENESIS_HASH, a)).not.toBe(hashEntry(GENESIS_HASH, b));
  });

  it('detects an edited row', () => {
    const rows = chain(3);
    rows[1] = { ...rows[1], actor: 'mallory' };
    expect(verifyChain(rows)).toMatchObject({
      valid: false,
      checked: 1,
      brokenAt: { id: 2, reason: 'entry content was changed' },
    });
  });

  it('detects a removed row', () => {
    const rows = chain(3);
    rows.splice(1, 1);
    expect(verifyChain(rows)).toMatchObject({ valid: false, checked: 1, brokenAt: { id: 3 } });
  });

  it('detects reordered rows', () => {
    const rows = chain(3);
    [rows[1], rows[2]] = [rows[2], rows[1]];
    expect(verifyChain(rows).valid).toBe(false);
  });
});
