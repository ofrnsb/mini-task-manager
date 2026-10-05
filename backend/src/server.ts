import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { openDb } from './db/connection.js';
import { createApp } from './http/app.js';

const env = z
  .object({
    PORT: z.coerce.number().int().positive().default(3001),
    DB_FILE: z.string().default('data/app.db'),
    STATIC_DIR: z.string().optional(),
  })
  .parse(process.env);

mkdirSync(dirname(env.DB_FILE), { recursive: true });
const db = openDb(env.DB_FILE);
const server = createApp(db, { staticDir: env.STATIC_DIR }).listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (db: ${env.DB_FILE})`);
});

// Finish in-flight requests and close the DB cleanly on docker stop / Ctrl+C.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
