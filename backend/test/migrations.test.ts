import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { MIGRATIONS, migrate } from '../src/db/migrations.js';

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mtm-'));
  dirs.push(dir);
  return join(dir, 'app.db');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('migrations', () => {
  it('brings a new database to the latest version', () => {
    const db = openDb(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });

  it('is a no-op when reopening an up-to-date file', () => {
    const file = tempFile();
    openDb(file)
      .prepare("INSERT INTO tasks (title, status, created_at, updated_at) VALUES ('x', 'to_do', 'a', 'a')")
      .run();
    const reopened = openDb(file);
    expect(reopened.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 1 });
  });

  it('runs only the pending migrations, each in its own transaction', () => {
    const db = new Database(':memory:');
    migrate(db, ['CREATE TABLE a (x)']);
    migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y)']);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });

  it('rolls back a failing migration and keeps the old version', () => {
    const db = new Database(':memory:');
    migrate(db, ['CREATE TABLE a (x)']);
    expect(() => migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y); SELECT nope FROM missing'])).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();
  });

  it('refuses a database created before migrations existed', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE tasks (id INTEGER)');
    expect(() => migrate(db)).toThrow(/predates migrations/);
  });

  it('refuses a database from a newer build', () => {
    const db = new Database(':memory:');
    db.pragma('user_version = 99');
    expect(() => migrate(db)).toThrow(/newer than this build/);
  });
});
