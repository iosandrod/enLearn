export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

const SCHEMA_CACHE_UNAVAILABLE_CODE = 'PGRST002';
const DEFAULT_SCHEMA_CACHE_RETRY_DELAYS_MS = [250] as const;

type SupabaseFetchOptions = {
  timeoutMs?: number;
  schemaCacheRetryDelaysMs?: readonly number[];
  onRequest?: (request: { method: string; url: string }) => void;
};

function createTimeoutError(timeoutMs: number) {
  const error = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
  error.name = 'TimeoutError';
  return error;
}

function createAttemptSignal(sourceSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromSource = () => controller.abort(sourceSignal?.reason);

  if (sourceSignal?.aborted) {
    abortFromSource();
  } else {
    sourceSignal?.addEventListener('abort', abortFromSource, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(createTimeoutError(timeoutMs));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      sourceSignal?.removeEventListener('abort', abortFromSource);
    }
  };
}

async function isSchemaCacheUnavailable(response: Response) {
  if (response.status !== 503) return false;

  const payload = await response.clone().json().catch(() => null) as {
    code?: unknown;
  } | null;
  return payload?.code === SCHEMA_CACHE_UNAVAILABLE_CODE;
}

function waitForRetry(delayMs: number, sourceSignal: AbortSignal | null | undefined) {
  if (sourceSignal?.aborted) {
    return Promise.reject(sourceSignal.reason);
  }
  if (delayMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(sourceSignal?.reason);
    };
    const timeout = setTimeout(() => {
      sourceSignal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    sourceSignal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export function createSupabaseFetch(
  fetchImplementation: typeof fetch = fetch,
  options: SupabaseFetchOptions = {}
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? SUPABASE_REQUEST_TIMEOUT_MS;
  const retryDelays = options.schemaCacheRetryDelaysMs ?? DEFAULT_SCHEMA_CACHE_RETRY_DELAYS_MS;

  return async (input, init) => {
    options.onRequest?.({
      method: String(init?.method ?? (
        typeof Request !== 'undefined' && input instanceof Request
          ? input.method
          : 'GET'
      )).toUpperCase(),
      url: typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    });
    const sourceSignal = init?.signal ?? (
      typeof Request !== 'undefined' && input instanceof Request
        ? input.signal
        : undefined
    );

    for (let attempt = 0; ; attempt += 1) {
      const attemptSignal = createAttemptSignal(sourceSignal, timeoutMs);
      let response: Response;
      try {
        response = await fetchImplementation(input, {
          ...(init ?? {}),
          signal: attemptSignal.signal
        });
      } finally {
        attemptSignal.dispose();
      }

      if (
        attempt >= retryDelays.length ||
        !(await isSchemaCacheUnavailable(response))
      ) {
        return response;
      }

      await waitForRetry(retryDelays[attempt], sourceSignal);
    }
  };
}
