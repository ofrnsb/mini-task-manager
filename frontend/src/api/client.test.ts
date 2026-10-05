import { describe, expect, it } from 'vitest';
import { json, mockFetch, task } from '../test/utils';
import { api, ApiRequestError } from './client';

describe('api client', () => {
  it('returns data that matches the shared schema', async () => {
    mockFetch(() => json([task()]));
    await expect(api.listTasks()).resolves.toEqual([task()]);
  });

  it('rejects a response that breaks the contract', async () => {
    mockFetch(() => json([{ ...task(), status: 'archived' }]));
    await expect(api.listTasks()).rejects.toThrow(/Unexpected response from \/tasks/);
  });

  it('maps an error body to ApiRequestError with code and details', async () => {
    mockFetch(() => json({ error: { code: 'INVALID_TRANSITION', message: 'nope' } }, 409));
    const err = await api.changeStatus(1, 'done', 'john.doe', 'to_do').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: 'INVALID_TRANSITION', message: 'nope' });
  });

  it('sends the actor header and the status the user saw', async () => {
    const fetch = mockFetch(() => json({ task: task({ status: 'pending' }), changed: true, lastChange: null }));
    await api.changeStatus(1, 'pending', 'jane.smith', 'to_do');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/tasks/1/status');
    expect((init!.headers as Record<string, string>)['x-actor']).toBe('jane.smith');
    expect(JSON.parse(init!.body as string)).toEqual({ status: 'pending', expectedStatus: 'to_do' });
  });
});
