import { spawn, type ChildProcess } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';

type EnvMap = Record<string, string>;

type Options = {
  apiUrl: string;
  dryRun: boolean;
  envFile: string;
  maxConcurrentRuns: number;
};

const DEFAULT_API_URL = 'http://localhost:3030';
const DEFAULT_MAX_CONCURRENT_RUNS = 1_000_000;

type WorkerLock = {
  apiUrl: string;
  pid: number;
  projectRef: string;
  startedAt: string;
};

function info(message: string) {
  console.log(`[enLearn-trigger] ${message}`);
}

function readDotEnv(filePath: string): EnvMap {
  if (!existsSync(filePath)) return {};

  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<EnvMap>((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return env;

      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
      return env;
    }, {});
}

function writeWorkerEnv(sourceEnvFile: string, targetEnvFile: string, projectRef: string) {
  const lines = existsSync(sourceEnvFile)
    ? readFileSync(sourceEnvFile, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !/^\s*TRIGGER_(PROJECT_REF|SECRET_KEY|ACCESS_TOKEN)\s*=/.test(line))
    : [];

  lines.push(`TRIGGER_PROJECT_REF=${projectRef}`);
  writeFileSync(targetEnvFile, `${lines.join('\n')}\n`, 'utf8');
}

function parseArgs(argv: string[]): Partial<Options> {
  const options: Partial<Options> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const rawArg = argv[index];
    const [rawName, inlineValue] = rawArg.includes('=')
      ? rawArg.split(/=(.*)/s, 2)
      : [rawArg, undefined];
    const name = normalizeArgName(rawName);
    const readValue = () => inlineValue ?? argv[++index];

    if (name === 'apiurl') {
      options.apiUrl = readValue();
    } else if (name === 'dryrun' || name === 'check') {
      options.dryRun = true;
    } else if (name === 'envfile') {
      options.envFile = readValue();
    } else if (name === 'maxconcurrentruns') {
      const value = Number(readValue());
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('MaxConcurrentRuns must be a positive number.');
      }
      options.maxConcurrentRuns = value;
    }
  }

  return options;
}

function normalizeArgName(name: string) {
  return name.replace(/^-+/, '').replace(/[-_]/g, '').toLowerCase();
}

function firstNonBlank(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim();
}

function resolveEnvFile(value: string | undefined, repoRoot: string) {
  if (!value?.trim()) return join(repoRoot, '.env');
  return resolve(isAbsolute(value) ? value : join(repoRoot, value));
}

function resolveTriggerEnvFile(sourceEnv: EnvMap, repoRoot: string) {
  const configured = sourceEnv.TRIGGER_ENV_FILE?.trim();
  if (!configured) return resolve(repoRoot, '..', 'trigger.dev-main', '.env');
  return resolve(isAbsolute(configured) ? configured : join(repoRoot, configured));
}

function resolveTriggerCommand(apiDir: string) {
  const requireFromApi = createRequire(join(apiDir, 'package.json'));
  const packageJsonPath = requireFromApi.resolve('trigger.dev/package.json');
  const cliPath = join(dirname(packageJsonPath), 'dist', 'esm', 'index.js');

  if (!existsSync(cliPath)) {
    throw new Error(`Unable to locate Trigger.dev CLI entrypoint: ${cliPath}`);
  }

  return {
    command: process.execPath,
    argsPrefix: [cliPath]
  };
}

async function ignoreUnavailableLocalProxy(env: NodeJS.ProcessEnv) {
  const proxyValue = env.ALL_PROXY;
  const match = proxyValue?.match(/^https?:\/\/(?:localhost|127\.0\.0\.1):(?<port>\d+)(?:\/|$)/i);
  const port = Number(match?.groups?.port);
  if (!Number.isFinite(port) || port <= 0) return;

  if (await canConnectToLocalPort(port)) return;

  info(`Ignoring unavailable local proxy on port ${port}.`);
  delete env.ALL_PROXY;
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
}

function canConnectToLocalPort(port: number) {
  return new Promise<boolean>((resolveConnection) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveConnection(value);
    };

    socket.setTimeout(750);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function terminateChild(child: ChildProcess) {
  child.kill('SIGTERM');
}

function runTriggerCli(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  workerEnvFile: string,
  workerLockFile: string
) {
  return new Promise<number>((resolveExitCode, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit'
    });

    const cleanup = () => {
      rmSync(workerEnvFile, { force: true });
      releaseWorkerLock(workerLockFile);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    };

    const onSignal = () => {
      terminateChild(child);
    };

    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    child.once('error', (error) => {
      cleanup();
      reject(error);
    });

    child.once('exit', (code, signal) => {
      cleanup();
      resolveExitCode(code ?? (signal ? 1 : 0));
    });
  });
}

function acquireWorkerLock(lockFile: string, projectRef: string, apiUrl: string) {
  if (isWorkerLockActive(lockFile)) return false;

  mkdirSync(dirname(lockFile), { recursive: true });

  const lock: WorkerLock = {
    apiUrl: normalizeApiUrl(apiUrl),
    pid: process.pid,
    projectRef,
    startedAt: new Date().toISOString()
  };

  try {
    const fd = openSync(lockFile, 'wx');
    try {
      writeFileSync(fd, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST' && isWorkerLockActive(lockFile)) {
      return false;
    }
    throw error;
  }
}

function isWorkerLockActive(lockFile: string) {
  const lock = readWorkerLock(lockFile);
  if (!lock) return false;

  if (isProcessRunning(lock.pid)) return true;

  rmSync(lockFile, { force: true });
  return false;
}

function readWorkerLock(lockFile: string): WorkerLock | null {
  if (!existsSync(lockFile)) return null;

  try {
    const parsed = JSON.parse(readFileSync(lockFile, 'utf8')) as Partial<WorkerLock>;
    if (!parsed.pid || !parsed.projectRef || !parsed.apiUrl) return null;
    return {
      apiUrl: parsed.apiUrl,
      pid: parsed.pid,
      projectRef: parsed.projectRef,
      startedAt: parsed.startedAt ?? ''
    };
  } catch {
    rmSync(lockFile, { force: true });
    return null;
  }
}

function releaseWorkerLock(lockFile: string) {
  const lock = readWorkerLock(lockFile);
  if (!lock || lock.pid !== process.pid) return;
  rmSync(lockFile, { force: true });
}

function isProcessRunning(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === 'EPERM';
  }
}

async function isTriggerDevWorkerConnected(apiUrl: string, projectRef: string, accessToken: string) {
  try {
    const response = await fetch(
      `${normalizeApiUrl(apiUrl)}/api/v1/projects/${encodeURIComponent(projectRef)}/dev-status`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) return false;

    const payload = await response.json() as { isConnected?: unknown };
    return payload.isConnected === true;
  } catch {
    return false;
  }
}

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.replace(/\/+$/, '');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function main() {
  const apiDir = resolve(__dirname, '..');
  const repoRoot = resolve(apiDir, '..');
  const args = parseArgs(process.argv.slice(2));
  const apiUrl = firstNonBlank(args.apiUrl, process.env.TRIGGER_API_URL, DEFAULT_API_URL) ?? DEFAULT_API_URL;
  const envFile = resolveEnvFile(args.envFile, repoRoot);
  const maxConcurrentRuns = args.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS;

  if (!existsSync(envFile)) {
    throw new Error(`Missing env file: ${envFile}`);
  }

  const sourceEnv = readDotEnv(envFile);
  const triggerEnvFile = resolveTriggerEnvFile(sourceEnv, repoRoot);
  if (!existsSync(triggerEnvFile)) {
    throw new Error(`Unable to locate the Trigger.dev env file: ${triggerEnvFile}`);
  }

  const triggerEnv = readDotEnv(triggerEnvFile);
  const projectName = firstNonBlank(sourceEnv.TRIGGER_PROJECT_NAME, 'enlearn-workflow-local')!;
  const projectRef = firstNonBlank(sourceEnv.TRIGGER_PROJECT_REF, triggerEnv.TRIGGER_PROJECT_REF);
  const secretKey = firstNonBlank(sourceEnv.TRIGGER_SECRET_KEY, triggerEnv.TRIGGER_SECRET_KEY);
  const accessToken = firstNonBlank(sourceEnv.TRIGGER_ACCESS_TOKEN, triggerEnv.TRIGGER_ACCESS_TOKEN);

  if (!projectRef || !secretKey) {
    throw new Error(`TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY are required in ${envFile} or ${triggerEnvFile}`);
  }
  if (!accessToken) {
    throw new Error(`TRIGGER_ACCESS_TOKEN is required by the Trigger.dev CLI in ${envFile} or ${triggerEnvFile}`);
  }

  if (args.dryRun) {
    resolveTriggerCommand(apiDir);
    info(`Trigger.dev worker config OK for ${projectRef} at ${apiUrl}.`);
    return 0;
  }

  const workerLockFile = join(apiDir, '.trigger', 'trigger-worker-autostart.lock.json');
  if (!acquireWorkerLock(workerLockFile, projectRef, apiUrl)) {
    info('Trigger.dev worker is already running for enLearn. Skip starting another one.');
    return 0;
  }

  const workerEnvFile = join(apiDir, '.trigger.worker.env');
  try {
    if (await isTriggerDevWorkerConnected(apiUrl, projectRef, accessToken)) {
      releaseWorkerLock(workerLockFile);
      info('Trigger.dev reports an active dev worker for this project. Skip starting another one.');
      return 0;
    }

    writeWorkerEnv(envFile, workerEnvFile, projectRef);

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      TRIGGER_ACCESS_TOKEN: accessToken,
      TRIGGER_API_URL: apiUrl,
      TRIGGER_PROJECT_NAME: projectName
    };

    await ignoreUnavailableLocalProxy(childEnv);

    const triggerCommand = resolveTriggerCommand(apiDir);
    info(`Starting Trigger.dev worker: ${apiUrl}`);
    return await runTriggerCli(
      triggerCommand.command,
      [
        ...triggerCommand.argsPrefix,
        'dev',
        'start',
        '-a',
        apiUrl,
        '--env-file',
        workerEnvFile,
        '--max-concurrent-runs',
        String(maxConcurrentRuns)
      ],
      apiDir,
      childEnv,
      workerEnvFile,
      workerLockFile
    );
  } catch (error) {
    rmSync(workerEnvFile, { force: true });
    releaseWorkerLock(workerLockFile);
    throw error;
  }
}

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`[enLearn-trigger] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
