export const SUPABASE_REQUEST_TIMEOUT_MS = 30_000;

const SCHEMA_CACHE_UNAVAILABLE_CODE = 'PGRST002';
const DEFAULT_SCHEMA_CACHE_RETRY_DELAYS_MS = [250] as const;
const DEFAULT_NETWORK_RETRY_DELAYS_MS = [150, 500, 1200, 2500, 5000] as const;

type SupabaseFetchOptions = {
  timeoutMs?: number;
  schemaCacheRetryDelaysMs?: readonly number[];
  networkRetryDelaysMs?: readonly number[];
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
  const networkRetryDelays = options.networkRetryDelaysMs ?? DEFAULT_NETWORK_RETRY_DELAYS_MS;

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
    const requestTemplate = typeof Request !== 'undefined' && input instanceof Request
      ? input.clone()
      : input;

    let networkRetryCount = 0;
    let schemaCacheRetryCount = 0;

    for (;;) {
      const attemptSignal = createAttemptSignal(sourceSignal, timeoutMs);
      let response: Response;
      try {
        const attemptInput = typeof Request !== 'undefined' && requestTemplate instanceof Request
          ? requestTemplate.clone()
          : requestTemplate;
        response = await fetchImplementation(attemptInput, {
          ...(init ?? {}),
          signal: attemptSignal.signal
        });
      } catch (error) {
        if (networkRetryCount >= networkRetryDelays.length) throw error;
        await waitForRetry(networkRetryDelays[networkRetryCount], sourceSignal);
        networkRetryCount += 1;
        continue;
      } finally {
        attemptSignal.dispose();
      }

      if (
        schemaCacheRetryCount >= retryDelays.length ||
        !(await isSchemaCacheUnavailable(response))
      ) {
        return response;
      }

      await waitForRetry(retryDelays[schemaCacheRetryCount], sourceSignal);
      schemaCacheRetryCount += 1;
    }
  };
}
