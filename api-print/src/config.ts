import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';

export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const origins = (env.PRINT_ASSET_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('PRINT_ASSET_ORIGINS must contain HTTP(S) origins.');
    return url.origin;
  });
  return {
    host: env.PRINT_API_HOST?.trim() || '0.0.0.0',
    port: integer(env.PRINT_API_PORT, 3302, 1, 65535),
    workerCount: integer(env.PRINT_WORKER_COUNT, Math.min(4, Math.max(1, availableParallelism() - 1)), 1, 32),
    maxQueue: integer(env.PRINT_MAX_QUEUE, 32, 1, 1000),
    timeoutMs: integer(env.PRINT_RENDER_TIMEOUT_MS, 30_000, 100, 300_000),
    maxBodyBytes: integer(env.PRINT_MAX_BODY_BYTES, 5 * 1024 * 1024, 1024, 20 * 1024 * 1024),
    allowOrigin: env.PRINT_API_ALLOW_ORIGIN?.trim() || '*',
    assetOrigins: origins,
    executablePath: executable(env.PRINT_CHROMIUM_EXECUTABLE_PATH)
  };
}

export type Configuration = ReturnType<typeof configuration>;

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Invalid configuration integer: expected ${min}..${max}.`);
  return result;
}

function executable(configured: string | undefined) {
  if (configured?.trim()) {
    if (!existsSync(configured.trim())) throw new Error('PRINT_CHROMIUM_EXECUTABLE_PATH does not exist.');
    return configured.trim();
  }
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(existsSync);
}
