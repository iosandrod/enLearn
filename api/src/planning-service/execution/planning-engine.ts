import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { getEnv } from '../../common/utils/env';
import {
  CppTypescriptPlanningEngine,
  getCppTypescriptCapabilities,
  resolveCppTypescriptRoot,
  resolveCppTypescriptWorker
} from './cpp-typescript-planning-engine';
import { validatePlanningEngineResult } from './planning-engine-result';
import {
  PlanningCanceledError,
  type PlanningEngine,
  type PlanningEngineCapabilities,
  type PlanningEngineRequest,
  type PlanningEngineResult
} from './planning-execution.types';

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_LOG_LINES = 100_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024 * 1024;

export type ProcessPlanningEngineOptions = {
  bridgePath: string;
  executable: string;
  maxLogBytes?: number;
  maxLogLines?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
};

export type HttpPlanningEngineOptions = {
  endpoint: string;
  maxResponseBytes?: number;
  timeoutMs?: number;
  token?: string;
};

export class ProcessPlanningEngine implements PlanningEngine {
  readonly mode = 'process' as const;
  private readonly maxLogBytes: number;
  private readonly maxLogLines: number;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: ProcessPlanningEngineOptions) {
    this.maxLogBytes = positiveInteger(options.maxLogBytes, DEFAULT_MAX_LOG_BYTES);
    this.maxLogLines = positiveInteger(options.maxLogLines, DEFAULT_MAX_LOG_LINES);
    this.maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  }

  async solve(
    request: PlanningEngineRequest,
    options: {
      onLog?: (line: string) => void;
      onProcess?: (processId: number) => Promise<void> | void;
      signal?: AbortSignal;
    } = {}
  ): Promise<PlanningEngineResult> {
    if (options.signal?.aborted) throw new PlanningCanceledError();
    const directory = await mkdtemp(join(tmpdir(), 'enlearn-frepple-'));
    const requestPath = join(directory, 'request.json');
    const modelPath = join(directory, 'model.json');
    const outputPath = join(directory, 'result.json');
    try {
      await Promise.all([
        writeFile(requestPath, JSON.stringify({
          bucketDates: request.bucketDates,
          bucketizedResources: request.bucketizedResources,
          parameters: request.parameters
        }), 'utf8'),
        writeFile(modelPath, JSON.stringify(request.model), 'utf8')
      ]);
      await this.runProcess(requestPath, modelPath, outputPath, options);
      const outputStats = await stat(outputPath).catch(() => undefined);
      if (!outputStats) throw new Error('frePPLe bridge did not produce a result file.');
      if (outputStats.size > this.maxResponseBytes) {
        throw new Error(`frePPLe result exceeds ${this.maxResponseBytes} bytes.`);
      }
      const raw = await readFile(outputPath, 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        throw new Error(`frePPLe bridge returned invalid JSON: ${errorMessage(error)}`);
      }
      return validatePlanningEngineResult(parsed);
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async runProcess(
    requestPath: string,
    modelPath: string,
    outputPath: string,
    options: {
      onLog?: (line: string) => void;
      onProcess?: (processId: number) => Promise<void> | void;
      signal?: AbortSignal;
    }
  ) {
    const child = spawn(this.options.executable, [this.options.bridgePath], {
      cwd: dirname(requestPath),
      detached: process.platform !== 'win32',
      env: childEnvironment(requestPath, modelPath, outputPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const exitPromise = waitForExit(child);
    const logs = new BoundedLogCollector(
      this.maxLogBytes,
      this.maxLogLines,
      options.onLog
    );
    child.stdout?.on('data', (chunk: Buffer) => logs.add(chunk));
    child.stderr?.on('data', (chunk: Buffer) => logs.add(chunk));

    let timedOut = false;
    let canceled = false;
    let termination: Promise<void> | undefined;
    const terminate = () => termination ??= terminateProcessTree(child);
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminate();
    }, this.timeoutMs);
    timeout.unref?.();
    const abort = () => {
      canceled = true;
      void terminate();
    };
    options.signal?.addEventListener('abort', abort, { once: true });

    try {
      if (!child.pid) throw new Error('Unable to start frePPLe process.');
      await options.onProcess?.(child.pid);
      const exit = await exitPromise;
      await termination;
      if (canceled || options.signal?.aborted) throw new PlanningCanceledError();
      if (timedOut) throw new Error(`frePPLe process timed out after ${this.timeoutMs} ms.`);
      if (exit.error) throw exit.error;
      if (exit.code !== 0) {
        const detail = logs.tailText().trim();
        throw new Error(
          `frePPLe process exited with code ${String(exit.code)}${detail ? `: ${detail}` : '.'}`
        );
      }
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) await terminate();
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      logs.end();
    }
  }
}

export class HttpPlanningEngine implements PlanningEngine {
  readonly mode = 'http' as const;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpPlanningEngineOptions) {
    this.maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  }

  async solve(
    request: PlanningEngineRequest,
    options: { signal?: AbortSignal } = {}
  ): Promise<PlanningEngineResult> {
    if (options.signal?.aborted) throw new PlanningCanceledError();
    const controller = new AbortController();
    const requestId = randomUUID();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    timeout.unref?.();
    const abort = () => {
      controller.abort();
      void this.cancel(requestId);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-planning-request-id': requestId,
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {})
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
        throw new Error(`frePPLe HTTP response exceeds ${this.maxResponseBytes} bytes.`);
      }
      const bytes = await readResponseWithLimit(response, this.maxResponseBytes);
      const text = new TextDecoder().decode(bytes);
      if (!response.ok) {
        throw new Error(`frePPLe HTTP endpoint returned ${response.status}: ${text.slice(0, 4_096)}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(`frePPLe HTTP endpoint returned invalid JSON: ${errorMessage(error)}`);
      }
      return validatePlanningEngineResult(parsed);
    } catch (error) {
      if (options.signal?.aborted) throw new PlanningCanceledError();
      if (timedOut) throw new Error(`frePPLe HTTP request timed out after ${this.timeoutMs} ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private async cancel(requestId: string) {
    try {
      await fetch(cancelEndpoint(this.options.endpoint), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {})
        },
        body: JSON.stringify({ requestId }),
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      // The solve connection closing is also observed by the sidecar as a cancellation.
    }
  }
}

export function createPlanningEngine(env = getEnv()): PlanningEngine {
  const mode = normalizedMode(env.PLANNING_ENGINE_MODE);
  const timeoutMs = positiveInteger(env.PLANNING_ENGINE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = positiveInteger(
    env.PLANNING_ENGINE_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES
  );
  if (mode === 'http') {
    const endpoint = env.PLANNING_ENGINE_ENDPOINT?.trim();
    if (!endpoint) throw new Error('PLANNING_ENGINE_ENDPOINT is required in HTTP mode.');
    return new HttpPlanningEngine({
      endpoint,
      maxResponseBytes,
      timeoutMs,
      token: env.PLANNING_ENGINE_TOKEN?.trim()
    });
  }
  if (mode === 'cpp-typescript') {
    const workingDirectory = resolveCppTypescriptRoot(env.PLANNING_CPP_TYPESCRIPT_ROOT);
    const workerPath = resolveCppTypescriptWorker(
      env.PLANNING_CPP_TYPESCRIPT_WORKER,
      workingDirectory
    );
    return new CppTypescriptPlanningEngine({
      maxLogBytes: positiveInteger(env.PLANNING_ENGINE_MAX_LOG_BYTES, DEFAULT_MAX_LOG_BYTES),
      maxLogLines: positiveInteger(env.PLANNING_ENGINE_MAX_LOG_LINES, DEFAULT_MAX_LOG_LINES),
      maxResponseBytes,
      timeoutMs,
      workerPath,
      workingDirectory
    });
  }
  const bridgePath = resolveFreppleBridgePath(env.PLANNING_FREPPLE_BRIDGE);
  return new ProcessPlanningEngine({
    bridgePath,
    executable: env.PLANNING_FREPPLE_EXECUTABLE?.trim() || env.FREPPLE_EXECUTABLE?.trim() || 'frepple',
    maxLogBytes: positiveInteger(env.PLANNING_ENGINE_MAX_LOG_BYTES, DEFAULT_MAX_LOG_BYTES),
    maxLogLines: positiveInteger(env.PLANNING_ENGINE_MAX_LOG_LINES, DEFAULT_MAX_LOG_LINES),
    maxResponseBytes,
    timeoutMs
  });
}

export function getPlanningEngineCapabilities(env = getEnv()): PlanningEngineCapabilities {
  const mode = normalizedMode(env.PLANNING_ENGINE_MODE);
  if (mode === 'http') {
    const endpoint = env.PLANNING_ENGINE_ENDPOINT?.trim();
    return endpoint
      ? { available: true, endpoint, mode }
      : { available: false, mode, reason: 'PLANNING_ENGINE_ENDPOINT is not configured.' };
  }
  if (mode === 'cpp-typescript') {
    return getCppTypescriptCapabilities(
      env.PLANNING_CPP_TYPESCRIPT_ROOT,
      env.PLANNING_CPP_TYPESCRIPT_WORKER
    );
  }
  const executable = env.PLANNING_FREPPLE_EXECUTABLE?.trim() ||
    env.FREPPLE_EXECUTABLE?.trim() || 'frepple';
  let bridgePath: string;
  try {
    bridgePath = resolveFreppleBridgePath(env.PLANNING_FREPPLE_BRIDGE);
  } catch (error) {
    return { available: false, executable, mode, reason: errorMessage(error) };
  }
  if (!commandAvailable(executable)) {
    return {
      available: false,
      bridgePath,
      executable,
      mode,
      reason: `frePPLe executable is not available: ${executable}`
    };
  }
  return { available: true, bridgePath, executable, mode };
}

export function resolveFreppleBridgePath(configured?: string) {
  const candidates = [
    configured?.trim(),
    resolve(__dirname, 'frepple-engine.py'),
    resolve(process.cwd(), 'src/planning-service/execution/frepple-engine.py'),
    resolve(process.cwd(), 'dist/planning-service/execution/frepple-engine.py'),
    resolve(process.cwd(), 'api/src/planning-service/execution/frepple-engine.py'),
    resolve(process.cwd(), 'api/dist/planning-service/execution/frepple-engine.py')
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find(existsSync);
  if (!found) throw new Error('frePPLe bridge script was not found.');
  return found;
}

class BoundedLogCollector {
  private bytes = 0;
  private lines = 0;
  private partial = '';
  private readonly tail: string[] = [];
  private truncated = false;

  constructor(
    private readonly maxBytes: number,
    private readonly maxLines: number,
    private readonly onLog?: (line: string) => void
  ) {}

  add(chunk: Buffer) {
    if (this.truncated) return;
    this.bytes += chunk.byteLength;
    if (this.bytes > this.maxBytes) {
      this.truncate();
      return;
    }
    const text = this.partial + chunk.toString('utf8');
    const parts = text.split(/\r?\n/);
    this.partial = parts.pop() ?? '';
    for (const line of parts) {
      if (this.lines >= this.maxLines) {
        this.truncate();
        return;
      }
      this.emit(line);
    }
  }

  end() {
    if (this.partial && !this.truncated && this.lines < this.maxLines) this.emit(this.partial);
    this.partial = '';
  }

  tailText() {
    return this.tail.join('\n').slice(-32_768);
  }

  private emit(line: string) {
    this.lines += 1;
    this.tail.push(line);
    while (this.tail.join('\n').length > 32_768 && this.tail.length > 1) this.tail.shift();
    this.onLog?.(line);
  }

  private truncate() {
    this.truncated = true;
    this.partial = '';
    this.emit(`[planning-engine] log truncated at ${this.maxBytes} bytes or ${this.maxLines} lines`);
  }
}

function childEnvironment(requestPath: string, modelPath: string, outputPath: string) {
  const blocked = /^(DATABASE_URL|DIRECT_URL|PG[A-Z_]*|SUPABASE_[A-Z_]*|NEXT_PUBLIC_SUPABASE_[A-Z_]*|REDIS_[A-Z_]*|TRIGGER_[A-Z_]*)$/;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key, value]) => value !== undefined && !blocked.test(key))
  ) as NodeJS.ProcessEnv;
  return {
    ...env,
    ENLEARN_FREPPLE_MODEL: modelPath,
    ENLEARN_FREPPLE_OUTPUT: outputPath,
    ENLEARN_FREPPLE_REQUEST: requestPath
  };
}

function waitForExit(child: ChildProcess) {
  return new Promise<{ code: number | null; error?: Error; signal: NodeJS.Signals | null }>((resolveExit) => {
    let spawnError: Error | undefined;
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (code, signal) => resolveExit({ code, error: spawnError, signal }));
  });
}

async function readResponseWithLimit(response: Response, maxBytes: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`frePPLe HTTP response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function terminateProcessTree(child: ChildProcess) {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolveTermination) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      killer.once('close', () => resolveTermination());
      killer.once('error', () => {
        child.kill('SIGKILL');
        resolveTermination();
      });
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await delay(2_000);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

function commandAvailable(command: string) {
  if (isAbsolute(command) || command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  return spawnSync(finder, [command], { stdio: 'ignore', windowsHide: true }).status === 0;
}

function normalizedMode(value: unknown): 'http' | 'process' | 'cpp-typescript' {
  const mode = String(value ?? 'process').trim().toLowerCase();
  if (mode !== 'http' && mode !== 'process' && mode !== 'cpp-typescript') {
    throw new Error('PLANNING_ENGINE_MODE must be process, http, or cpp-typescript.');
  }
  return mode;
}

function cancelEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/solve\/?$/, '/cancel');
  return url.toString();
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
