const TRANSIENT_POSTGRES_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '57P01',
  '57P02',
  '57P03',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT'
]);

const TRANSIENT_POSTGRES_MESSAGES = [
  /connection terminated unexpectedly/i,
  /connection terminated due to connection timeout/i,
  /connection timeout/i,
  /server closed the connection unexpectedly/i,
  /socket hang up/i,
  /read ECONNRESET/i,
  /write EPIPE/i,
  /connect ETIMEDOUT/i,
  /getaddrinfo (?:EAI_AGAIN|ENOTFOUND)/i
];

type RetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

export function isTransientPostgresError(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === 'object') {
      const code = readStringProperty(current, 'code');
      if (code && TRANSIENT_POSTGRES_CODES.has(code)) return true;

      const message = readStringProperty(current, 'message');
      if (message && TRANSIENT_POSTGRES_MESSAGES.some((pattern) => pattern.test(message))) {
        return true;
      }

      current = (current as { cause?: unknown }).cause;
      continue;
    }
    break;
  }

  return false;
}

export async function retryTransientPostgresOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const initialDelayMs = Math.max(0, Math.floor(options.initialDelayMs ?? 250));
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientPostgresError(error)) throw error;
      await sleep(initialDelayMs * 2 ** (attempt - 1));
    }
  }
}

function readStringProperty(value: object, key: string) {
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : undefined;
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
