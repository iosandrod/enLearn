import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';

const DEFAULT_RETRY_DELAYS_MS = [200, 500] as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function createTriggerWorkflowSupabaseClient(taskName: string) {
  const env = getEnv();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new Error(`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by ${taskName}.`);
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function executeTriggerWorkflowRpc(
  client: SupabaseClient,
  rpcName: string,
  args: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    retryDelaysMs?: readonly number[];
    sleep?: (milliseconds: number) => Promise<void>;
    onRetry?: (event: { attempt: number; delayMs: number; error: unknown }) => void;
  } = {}
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? delay;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(client.rpc(rpcName, args)),
        timeoutMs
      );
      if (error) throw error;
      return data;
    } catch (error) {
      const delayMs = retryDelaysMs[attempt];
      if (delayMs === undefined || !isTransientSupabaseError(error)) throw normalizeError(error);
      options.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
}

export function isTransientSupabaseError(error: unknown) {
  const value = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const status = Number(value?.status ?? value?.statusCode);
  const name = typeof value?.name === 'string' ? value.name : '';
  const message = `${String(value?.message ?? '')} ${String(
    (value?.cause as { message?: unknown } | undefined)?.message ?? ''
  )}`.toLowerCase();
  return (
    code === 'PGRST002' ||
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /fetch failed|network|socket|connection reset|econnreset|etimedout|timed out|temporarily unavailable/.test(message)
  );
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Supabase RPC timed out after ${timeoutMs} ms.`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  const value = error as { message?: unknown } | null;
  return new Error(typeof value?.message === 'string' ? value.message : String(error));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
