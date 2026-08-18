import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { getEnv } from '../../common/utils/env';

const DEFAULT_HEALTHCHECK_INTERVAL_MS = 15_000;
const MIN_HEALTHCHECK_INTERVAL_MS = 5_000;

let triggerWorker: ChildProcess | undefined;
let terminationHandlersInstalled = false;
let workerHealthCheckTimer: ReturnType<typeof setInterval> | undefined;
let workerHealthCheckInFlight = false;
let lastWorkerConnection: boolean | null = null;
let lastWorkerHealthError = '';

export function maybeStartTriggerDevWorkerFromApi() {
  const env = getEnv();
  if (!shouldStartTriggerWorker(process.argv, env)) {
    stopTriggerWorkerHealthCheck();
    return;
  }

  startTriggerDevWorker(env);
  startTriggerWorkerHealthCheck();
  installTerminationHandlers();
}

function startTriggerDevWorker(env: Record<string, string | undefined>) {
  if (triggerWorker) return;

  const apiDir = resolveApiDir();
  const apiUrl = env.TRIGGER_API_URL?.trim() || 'http://localhost:3030';
  const tsxCli = resolveTsxCli(apiDir);
  const args = [
    tsxCli,
    'scripts/start-trigger-dev.ts',
    '--api-url',
    apiUrl
  ];

  if (env.TRIGGER_WORKER_ENV_FILE?.trim()) {
    args.push('--env-file', env.TRIGGER_WORKER_ENV_FILE.trim());
  }
  if (env.TRIGGER_MAX_CONCURRENT_RUNS?.trim()) {
    args.push('--max-concurrent-runs', env.TRIGGER_MAX_CONCURRENT_RUNS.trim());
  }

  console.log(`[enLearn-trigger] Auto-starting Trigger.dev worker with backend (${apiUrl}).`);
  triggerWorker = spawn(process.execPath, args, {
    cwd: apiDir,
    env: process.env,
    stdio: 'inherit'
  });

  triggerWorker.once('error', (error) => {
    console.warn(`[enLearn-trigger] Unable to start Trigger.dev worker: ${error.message}`);
    triggerWorker = undefined;
  });

  triggerWorker.once('exit', (code, signal) => {
    if (code && code !== 0) {
      console.warn(`[enLearn-trigger] Trigger.dev worker exited with code ${code}.`);
    } else if (signal) {
      console.warn(`[enLearn-trigger] Trigger.dev worker stopped by ${signal}.`);
    }
    triggerWorker = undefined;
  });
}

export function shouldStartTriggerWorker(argv: string[], env: Record<string, string | undefined>) {
  if (argv.includes('--without-trigger-worker')) return false;

  const configured = (env.TRIGGER_DEV_WORKER_AUTOSTART ?? '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(configured)) return false;
  if (['1', 'true', 'on', 'yes'].includes(configured)) return true;

  if (argv.some(isDevApiEntryPoint)) return true;

  return argv.includes('--with-trigger-worker');
}

export function resolveWorkerHealthCheckIntervalMs(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(normalized ?? '')) return 0;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_HEALTHCHECK_INTERVAL_MS;
  return Math.max(MIN_HEALTHCHECK_INTERVAL_MS, Math.floor(parsed));
}

function isDevApiEntryPoint(value: string) {
  return /(?:^|[\\/])src[\\/](?:main|standalone)\.ts$/i.test(value);
}

function resolveApiDir() {
  const cwd = process.cwd();
  if (basename(cwd).toLowerCase() === 'api') return cwd;
  return resolve(cwd, 'api');
}

function resolveTsxCli(apiDir: string) {
  const requireFromApi = createRequire(join(apiDir, 'package.json'));
  return requireFromApi.resolve('tsx/cli');
}

function installTerminationHandlers() {
  if (terminationHandlersInstalled) return;
  terminationHandlersInstalled = true;

  process.once('exit', stopTriggerWorker);
  process.once('SIGINT', () => {
    stopTriggerWorker();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stopTriggerWorker();
    process.exit(143);
  });
}

function stopTriggerWorker() {
  stopTriggerWorkerHealthCheck();
  triggerWorker?.kill('SIGTERM');
  triggerWorker = undefined;
}

function startTriggerWorkerHealthCheck() {
  if (workerHealthCheckTimer) return;

  const intervalMs = resolveWorkerHealthCheckIntervalMs(
    getEnv().TRIGGER_DEV_WORKER_HEALTHCHECK_INTERVAL_MS
  );
  if (!intervalMs) return;

  workerHealthCheckTimer = setInterval(() => {
    void checkTriggerWorkerHealth();
  }, intervalMs);
  workerHealthCheckTimer.unref();
  void checkTriggerWorkerHealth();
}

function stopTriggerWorkerHealthCheck() {
  if (workerHealthCheckTimer) clearInterval(workerHealthCheckTimer);
  workerHealthCheckTimer = undefined;
  workerHealthCheckInFlight = false;
  lastWorkerConnection = null;
  lastWorkerHealthError = '';
}

async function checkTriggerWorkerHealth() {
  if (workerHealthCheckInFlight) return;
  workerHealthCheckInFlight = true;

  try {
    const env = getEnv();
    if (!shouldStartTriggerWorker(process.argv, env)) {
      stopTriggerWorkerHealthCheck();
      return;
    }

    const connected = await readTriggerWorkerPresence(env);
    if (connected === null) return;

    reportWorkerConnection(connected);
    if (!connected && !triggerWorker) {
      console.warn('[enLearn-trigger] No connected Trigger.dev worker detected; starting one.');
      startTriggerDevWorker(env);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== lastWorkerHealthError) {
      console.warn(`[enLearn-trigger] Trigger.dev worker health check failed: ${message}`);
      lastWorkerHealthError = message;
    }
  } finally {
    workerHealthCheckInFlight = false;
  }
}

async function readTriggerWorkerPresence(env: Record<string, string | undefined>) {
  const apiUrl = env.TRIGGER_API_URL?.trim();
  const projectRef = env.TRIGGER_PROJECT_REF?.trim();
  const accessToken = env.TRIGGER_ACCESS_TOKEN?.trim();
  if (!apiUrl || !projectRef || !accessToken) return null;

  const response = await fetch(
    `${apiUrl.replace(/\/+$/, '')}/api/v1/projects/${encodeURIComponent(projectRef)}/dev-status`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new Error(`Trigger.dev dev status returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as { isConnected?: unknown };
  return payload.isConnected === true;
}

function reportWorkerConnection(connected: boolean) {
  if (connected === lastWorkerConnection) return;
  lastWorkerConnection = connected;
  lastWorkerHealthError = '';
  console.log(`[enLearn-trigger] Trigger.dev worker ${connected ? 'connected' : 'not connected'}.`);
}
