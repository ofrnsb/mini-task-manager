// The API contract shared by backend and frontend.
// Every type is derived from a zod schema, so one definition is checked at
// compile time on both sides and validated at runtime on both sides: the
// backend parses requests with it, the frontend parses responses with it.
import { z } from 'zod';

// ---------- Domain constants ----------

export const TASK_STATUSES = ['to_do', 'pending', 'in_progress', 'done'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Predefined actors. There is no auth; the client picks one from a dropdown
// and sends it in the X-Actor header.
export const USERS = ['john.doe', 'jane.smith', 'budi.santoso'] as const;
export const ActorSchema = z.enum(USERS);
export type Actor = z.infer<typeof ActorSchema>;
export const ACTOR_HEADER = 'x-actor';

/** The only status a task may move to next, or null when it is done. */
export function nextStatus(status: TaskStatus): TaskStatus | null {
  return TASK_STATUSES[TASK_STATUSES.indexOf(status) + 1] ?? null;
}

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;

// ---------- Resources ----------

export const TaskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(), // empty string when not provided
  status: TaskStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

export const AuditLogSchema = z.object({
  id: z.number().int().positive(),
  taskId: z.number().int().positive(),
  taskTitle: z.string(), // snapshot at the time of the change
  actor: ActorSchema,
  fromStatus: TaskStatusSchema,
  toStatus: TaskStatusSchema,
  createdAt: z.iso.datetime(),
  prevHash: z.string(), // hash of the previous log row (any task)
  hash: z.string(), // sha256 over prevHash + this row's fields
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditChainReportSchema = z.object({
  valid: z.boolean(),
  checked: z.number().int().nonnegative(),
  headHash: z.string().nullable(), // newest row's hash; record it elsewhere to detect a rewritten chain
  brokenAt: z.object({ id: z.number().int(), reason: z.string() }).optional(),
});
export type AuditChainReport = z.infer<typeof AuditChainReportSchema>;

// ---------- Requests ----------

export const CreateTaskRequestSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(TITLE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).default(''),
});
export type CreateTaskRequest = z.input<typeof CreateTaskRequestSchema>;

export const ChangeStatusRequestSchema = z.object({
  status: TaskStatusSchema,
  // The status the client last saw. If the task moved since then, the API
  // answers 409 STALE_STATUS with the current task and who moved it.
  expectedStatus: TaskStatusSchema.optional(),
});
export type ChangeStatusRequest = z.infer<typeof ChangeStatusRequestSchema>;

export const AuditLogQuerySchema = z.object({
  actor: ActorSchema.optional(),
  taskId: z.coerce.number().int().positive().optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const TaskIdSchema = z.coerce.number().int().positive();

// ---------- Responses ----------

export const ChangeStatusResponseSchema = z.object({
  task: TaskSchema,
  changed: z.boolean(), // false when the task already had this status (no log written)
  lastChange: AuditLogSchema.nullable(), // the log entry that set the current status
});
export type ChangeStatusResponse = z.infer<typeof ChangeStatusResponseSchema>;

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'TASK_NOT_FOUND',
  'INVALID_TRANSITION',
  'STALE_STATUS',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** `details` of a STALE_STATUS error. */
export const StaleStatusDetailsSchema = z.object({
  task: TaskSchema,
  lastChange: AuditLogSchema.nullable(),
});
export type StaleStatusDetails = z.infer<typeof StaleStatusDetailsSchema>;
