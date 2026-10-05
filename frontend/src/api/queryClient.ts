import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        // Retry network blips, never a definite answer from the API (4xx).
        retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
      },
      // A retried PUT is safe (idempotent), but the user should see the first failure.
      mutations: { retry: false },
    },
  });
}
