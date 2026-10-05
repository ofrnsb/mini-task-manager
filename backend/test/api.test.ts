import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AuditLog, Task } from '@mtm/shared';
import { createApp } from '../src/http/app.js';
import { openDb, type DB } from '../src/db/connection.js';

let db: DB;
let app: ReturnType<typeof createApp>;

const as = (actor: string) => ({ 'X-Actor': actor });

async function createTask(title = 'Prepare Invoice'): Promise<Task> {
  const res = await request(app).post('/api/tasks').send({ title });
  expect(res.status).toBe(201);
  return res.body;
}

function setStatus(id: number, status: string, actor = 'jane.smith') {
  return request(app).put(`/api/tasks/${id}/status`).set(as(actor)).send({ status });
}

async function logsOf(id: number): Promise<AuditLog[]> {
  return (await request(app).get(`/api/tasks/${id}/audit-logs`)).body;
}

beforeEach(() => {
  db = openDb(':memory:');
  app = createApp(db);
});

describe('tasks', () => {
  it('creates a task in to_do and lists it', async () => {
    const task = await createTask();
    expect(task).toMatchObject({ title: 'Prepare Invoice', description: '', status: 'to_do' });
    const list = await request(app).get('/api/tasks');
    expect(list.body).toEqual([task]);
  });

  it('stores an optional description', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Pay rent', description: 'Transfer before the 5th' });
    expect(res.body.description).toBe('Transfer before the 5th');
  });

  it('rejects a missing title or a non-string description', async () => {
    expect((await request(app).post('/api/tasks').send({ title: '  ' })).status).toBe(400);
    expect((await request(app).post('/api/tasks').send({ title: 'x', description: 42 })).status).toBe(400);
  });
});

describe('status flow', () => {
  it('walks to_do → pending → in_progress → done', async () => {
    const { id } = await createTask();
    for (const status of ['pending', 'in_progress', 'done']) {
      const res = await setStatus(id, status);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ changed: true, task: { status } });
    }
  });

  it('rejects skipping a step and going backwards, without logging', async () => {
    const { id } = await createTask();
    const skip = await setStatus(id, 'in_progress');
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');

    await setStatus(id, 'pending');
    expect((await setStatus(id, 'to_do')).status).toBe(409);
    expect((await logsOf(id)).map((l) => [l.fromStatus, l.toStatus])).toEqual([['to_do', 'pending']]);
  });

  it('rejects an unknown status value and an unknown or missing actor', async () => {
    const { id } = await createTask();
    expect((await setStatus(id, 'archived')).status).toBe(400);
    expect((await setStatus(id, 'pending', 'mallory')).status).toBe(400);
    expect((await request(app).put(`/api/tasks/${id}/status`).send({ status: 'pending' })).status).toBe(400);
    expect(await logsOf(id)).toEqual([]);
  });

  it('is idempotent: same status returns 200 with changed=false and no new log', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending');
    const again = await setStatus(id, 'pending');
    expect(again.status).toBe(200);
    expect(again.body.changed).toBe(false);
    expect(await logsOf(id)).toHaveLength(1);
  });
});

describe('audit log', () => {
  it('records who changed what, from → to, in chronological order', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending', 'jane.smith');
    await setStatus(id, 'in_progress', 'budi.santoso');

    const logs = await logsOf(id);
    expect(
      logs.map(({ actor, fromStatus, toStatus, taskTitle }) => ({ actor, fromStatus, toStatus, taskTitle })),
    ).toEqual([
      { actor: 'jane.smith', fromStatus: 'to_do', toStatus: 'pending', taskTitle: 'Prepare Invoice' },
      { actor: 'budi.santoso', fromStatus: 'pending', toStatus: 'in_progress', taskTitle: 'Prepare Invoice' },
    ]);
    expect(logs.map((l) => l.createdAt)).toEqual([...logs.map((l) => l.createdAt)].sort());
  });

  it('keeps logs after the task is deleted', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending');
    expect((await request(app).delete(`/api/tasks/${id}`)).status).toBe(204);

    expect((await request(app).get('/api/tasks')).body).toEqual([]);
    expect(await logsOf(id)).toHaveLength(1);

    // Deleted tasks cannot be changed or deleted again.
    expect((await setStatus(id, 'in_progress')).status).toBe(404);
    expect((await request(app).delete(`/api/tasks/${id}`)).status).toBe(404);
  });

  it('cannot be updated or deleted, even with direct SQL', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending');
    expect(() => db.prepare("UPDATE audit_logs SET actor = 'mallory'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_logs').run()).toThrow(/append-only/);
    // A task with history cannot be hard-deleted either (foreign key).
    expect(() => db.prepare('DELETE FROM tasks WHERE id = ?').run(id)).toThrow(/FOREIGN KEY/);
    expect(await logsOf(id)).toHaveLength(1);
  });

  it('exposes no route to modify logs', async () => {
    const { id } = await createTask();
    expect((await request(app).delete(`/api/tasks/${id}/audit-logs`)).status).toBe(404);
    expect((await request(app).put(`/api/tasks/${id}/audit-logs`).send({})).status).toBe(404);
  });
});

describe('stale updates', () => {
  it('rejects a change based on a status the client no longer sees, and says who moved it', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending', 'jane.smith');
    await setStatus(id, 'in_progress', 'jane.smith');

    // budi still sees "to_do" and tries to move it to "pending".
    const res = await request(app)
      .put(`/api/tasks/${id}/status`)
      .set(as('budi.santoso'))
      .send({ status: 'pending', expectedStatus: 'to_do' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_STATUS');
    expect(res.body.error.details.task.status).toBe('in_progress');
    expect(res.body.error.details.lastChange.actor).toBe('jane.smith');
    expect(await logsOf(id)).toHaveLength(2);
  });

  it('treats a repeat of the same change as a no-op and reports who made it', async () => {
    const { id } = await createTask();
    await setStatus(id, 'pending', 'jane.smith');
    const res = await request(app)
      .put(`/api/tasks/${id}/status`)
      .set(as('budi.santoso'))
      .send({ status: 'pending', expectedStatus: 'to_do' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ changed: false, lastChange: { actor: 'jane.smith', toStatus: 'pending' } });
  });

  it('accepts a matching expectedStatus and rejects an unknown one', async () => {
    const { id } = await createTask();
    const ok = await request(app)
      .put(`/api/tasks/${id}/status`)
      .set(as('john.doe'))
      .send({ status: 'pending', expectedStatus: 'to_do' });
    expect(ok.body).toMatchObject({ changed: true, lastChange: { actor: 'john.doe', fromStatus: 'to_do' } });

    const bad = await request(app)
      .put(`/api/tasks/${id}/status`)
      .set(as('john.doe'))
      .send({ status: 'in_progress', expectedStatus: 'archived' });
    expect(bad.status).toBe(400);
  });
});

describe('activity feed', () => {
  it('lists changes across tasks in order, filterable by actor and task', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await setStatus(a.id, 'pending', 'john.doe');
    await setStatus(b.id, 'pending', 'jane.smith');
    await setStatus(a.id, 'in_progress', 'jane.smith');

    const all = (await request(app).get('/api/audit-logs')).body as AuditLog[];
    expect(all.map((l) => [l.taskTitle, l.actor])).toEqual([
      ['A', 'john.doe'],
      ['B', 'jane.smith'],
      ['A', 'jane.smith'],
    ]);

    const jane = (await request(app).get('/api/audit-logs?actor=jane.smith')).body as AuditLog[];
    expect(jane.map((l) => l.taskTitle)).toEqual(['B', 'A']);

    const onlyA = (await request(app).get(`/api/audit-logs?taskId=${a.id}`)).body as AuditLog[];
    expect(onlyA).toHaveLength(2);

    expect((await request(app).get('/api/audit-logs?actor=mallory')).status).toBe(400);
  });
});

describe('tamper evidence', () => {
  async function seed() {
    const a = await createTask('A');
    const b = await createTask('B');
    await setStatus(a.id, 'pending');
    await setStatus(b.id, 'pending');
    await setStatus(a.id, 'in_progress');
  }
  const verify = async () => (await request(app).get('/api/audit-logs/verify')).body;

  it('reports a valid chain and its head hash', async () => {
    expect(await verify()).toEqual({ valid: true, checked: 0, headHash: null });
    await seed();
    const logs = (await request(app).get('/api/audit-logs')).body as AuditLog[];
    expect(await verify()).toEqual({ valid: true, checked: 3, headHash: logs[2].hash });
    expect(logs[1].prevHash).toBe(logs[0].hash);
  });

  it('detects a row edited behind the triggers', async () => {
    await seed();
    db.exec('DROP TRIGGER audit_logs_no_update');
    db.prepare("UPDATE audit_logs SET actor = 'budi.santoso' WHERE id = 2").run();
    expect(await verify()).toMatchObject({ valid: false, checked: 1, brokenAt: { id: 2 } });
  });

  it('detects a row deleted behind the triggers', async () => {
    await seed();
    db.exec('DROP TRIGGER audit_logs_no_delete');
    db.prepare('DELETE FROM audit_logs WHERE id = 2').run();
    expect(await verify()).toMatchObject({ valid: false, checked: 1, brokenAt: { id: 3 } });
  });
});

describe('error contract', () => {
  it('rejects malformed JSON as INVALID_REQUEST', async () => {
    const res = await request(app).post('/api/tasks').set('content-type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('lists every invalid field with its path', async () => {
    const { id } = await createTask();
    const res = await request(app).put(`/api/tasks/${id}/status`).set(as('mallory')).send({ status: 'archived' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual(['x-actor']);

    const body = await request(app).post('/api/tasks').send({ title: '', description: 42 });
    expect(body.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual([
      'body.title',
      'body.description',
    ]);
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('reports health', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ ok: true });
  });
});

describe('audit log repository', () => {
  it('refuses to append outside a transaction', async () => {
    const { createAuditLogRepository } = await import('../src/repositories/auditLogRepository.js');
    const { id } = await createTask();
    const repo = createAuditLogRepository(db);
    expect(() =>
      repo.append({
        taskId: id,
        taskTitle: 'x',
        actor: 'john.doe',
        fromStatus: 'to_do',
        toStatus: 'pending',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow(/inside a transaction/);
  });
});
