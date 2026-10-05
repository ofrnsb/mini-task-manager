import Database from 'better-sqlite3';
import { migrate } from './migrations.js';

export type DB = Database.Database;

export function openDb(filename: string): DB {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  // With FKs on, a task that has logs cannot be hard-deleted either.
  db.pragma('foreign_keys = ON');
  // Wait for a competing writer (another process) instead of failing at once.
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}
