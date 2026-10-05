import { z } from 'zod';
import {
  ACTOR_HEADER,
  ApiErrorSchema,
  AuditChainReportSchema,
  AuditLogSchema,
  ChangeStatusResponseSchema,
  TaskSchema,
  type Actor,
  type AuditLogQuery,
  type ChangeStatusRequest,
  type CreateTaskRequest,
  type ErrorCode,
  type TaskStatus,
} from '@mtm/shared';

/** An error response from the API, with its machine-readable code. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  actor?: Actor;
  signal?: AbortSignal;
}

/**
 * Every response is parsed with the shared schema, so a backend that drifts
 * from the contract fails loudly here instead of rendering wrong data.
 */
async function request<S extends z.ZodType>(path: string, schema: S, opts: RequestOptions = {}): Promise<z.output<S>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.actor) headers[ACTOR_HEADER] = opts.actor;

  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(res.status, code, message, details);
    }
    throw new ApiRequestError(res.status, 'INTERNAL', `Request failed (${res.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(`Unexpected response from ${path}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const api = {
  listTasks: (signal?: AbortSignal) => request('/tasks', z.array(TaskSchema), { signal }),

  createTask: (input: CreateTaskRequest) => request('/tasks', TaskSchema, { method: 'POST', body: input }),

  changeStatus: (id: number, status: TaskStatus, actor: Actor, expectedStatus: TaskStatus) =>
    request(`/tasks/${id}/status`, ChangeStatusResponseSchema, {
      method: 'PUT',
      body: { status, expectedStatus } satisfies ChangeStatusRequest,
      actor,
    }),

  deleteTask: (id: number) => request(`/tasks/${id}`, z.undefined(), { method: 'DELETE' }),

  taskHistory: (id: number, signal?: AbortSignal) =>
    request(`/tasks/${id}/audit-logs`, z.array(AuditLogSchema), { signal }),

  searchLogs: (query: AuditLogQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.actor) params.set('actor', query.actor);
    if (query.taskId) params.set('taskId', String(query.taskId));
    const qs = params.size ? `?${params}` : '';
    return request(`/audit-logs${qs}`, z.array(AuditLogSchema), { signal });
  },

  verifyLogs: (signal?: AbortSignal) => request('/audit-logs/verify', AuditChainReportSchema, { signal }),
};
