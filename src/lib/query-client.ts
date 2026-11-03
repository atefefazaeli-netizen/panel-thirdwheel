import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, shouldRetry } from '@/lib/api';

/**
 * Reads retry on network errors and 5xx (twice, with backoff); 4xx never retries. Mutations never
 * retry automatically: the Idempotency-Key makes a manual retry safe, but staff decide.
 */
export function createQueryClient(opts: { toastMutationErrors?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // Screens that render the error inline set meta.silent.
        if (opts.toastMutationErrors === false || mutation.meta?.silent) return;
        toast.error(errorMessage(error));
      },
    }),
  });
}
