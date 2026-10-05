import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ToastProvider } from '../components/Toaster';
import type { AuditLog, Task } from '@mtm/shared';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Replaces fetch with a handler; returns the mock to inspect calls. */
export function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // As `wrapper` so rerender() keeps the provider.
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
}

const T0 = '2025-01-01T10:00:00.000Z';

export const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  title: 'Prepare Invoice',
  description: '',
  status: 'to_do',
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

export const log = (over: Partial<AuditLog> = {}): AuditLog => ({
  id: 1,
  taskId: 1,
  taskTitle: 'Prepare Invoice',
  actor: 'john.doe',
  fromStatus: 'to_do',
  toStatus: 'pending',
  createdAt: T0,
  prevHash: '0'.repeat(64),
  hash: 'a'.repeat(64),
  ...over,
});
