import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ACTOR_HEADER,
  ActorSchema,
  AuditLogQuerySchema,
  ChangeStatusRequestSchema,
  CreateTaskRequestSchema,
  TaskIdSchema,
  type ApiError,
  type ErrorCode,
} from '@mtm/shared';
import type { DB } from '../db/connection.js';
import { InvalidTransitionError, StaleStatusError, TaskNotFoundError } from '../domain/errors.js';
import { createTaskService, type Clock } from '../services/taskService.js';

class RequestValidationError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; '));
  }
}

/** Parses untrusted input with a shared schema; failures become 400 INVALID_REQUEST. */
function parse<S extends z.ZodType>(schema: S, value: unknown, at: string): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new RequestValidationError(
    result.error.issues.map((i) => ({ path: [at, ...i.path].filter(Boolean).join('.'), message: i.message })),
  );
}

const actorOf = (req: Request) => parse(ActorSchema, req.header(ACTOR_HEADER), ACTOR_HEADER);
const taskIdOf = (req: Request) => parse(TaskIdSchema, req.params.id, 'id');

function sendError(res: Response, status: number, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  res.status(status).json(body);
}

export interface AppOptions {
  clock?: Clock;
  /** Serve the built frontend from the same origin (used by the Docker image). */
  staticDir?: string;
}

export function createApp(db: DB, { clock, staticDir }: AppOptions = {}) {
  const tasks = createTaskService(db, clock);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  api.get('/tasks', (_req, res) => {
    res.json(tasks.list());
  });

  api.post('/tasks', (req, res) => {
    const { title, description } = parse(CreateTaskRequestSchema, req.body, 'body');
    res.status(201).json(tasks.create(title, description));
  });

  api.put('/tasks/:id/status', (req, res) => {
    const actor = actorOf(req);
    const { status, expectedStatus } = parse(ChangeStatusRequestSchema, req.body, 'body');
    res.json(tasks.changeStatus(taskIdOf(req), status, actor, expectedStatus));
  });

  api.delete('/tasks/:id', (req, res) => {
    tasks.remove(taskIdOf(req));
    res.status(204).end();
  });

  api.get('/tasks/:id/audit-logs', (req, res) => {
    res.json(tasks.taskHistory(taskIdOf(req)));
  });

  api.get('/audit-logs', (req, res) => {
    res.json(tasks.searchLogs(parse(AuditLogQuerySchema, req.query, 'query')));
  });

  api.get('/audit-logs/verify', (_req, res) => {
    res.json(tasks.verifyLogs());
  });

  api.use((_req, res) => sendError(res, 404, 'NOT_FOUND', 'Route not found'));
  app.use('/api', api);

  if (staticDir) {
    app.use(express.static(staticDir));
    app.get(/.*/, (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  // The one place that decides how failures look over HTTP.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RequestValidationError)
      return sendError(res, 400, 'INVALID_REQUEST', err.message, { issues: err.issues });
    if (err instanceof TaskNotFoundError) return sendError(res, 404, err.code, err.message);
    if (err instanceof InvalidTransitionError) return sendError(res, 409, err.code, err.message);
    if (err instanceof StaleStatusError) return sendError(res, 409, err.code, err.message, err.details);
    // body-parser marks malformed JSON this way; other SyntaxErrors are real bugs.
    if ((err as { type?: string }).type === 'entity.parse.failed') {
      return sendError(res, 400, 'INVALID_REQUEST', 'Request body is not valid JSON');
    }
    console.error(err);
    sendError(res, 500, 'INTERNAL', 'Internal server error');
  });

  return app;
}
