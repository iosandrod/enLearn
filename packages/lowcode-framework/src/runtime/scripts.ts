export const DEFAULT_LOW_CODE_SCRIPT_TIMEOUT_MS = 2_000;
export const DEFAULT_LOW_CODE_SCRIPT_STARTUP_TIMEOUT_MS = 15_000;
export const DEFAULT_LOW_CODE_SCRIPT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
export const DEFAULT_LOW_CODE_SCRIPT_STACK_LIMIT_BYTES = 512 * 1024;
export const DEFAULT_LOW_CODE_SCRIPT_MAX_API_CALLS = 50;
export const DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES = 256 * 1024*100;

export type LowCodeScriptCapabilityName =
  | 'action.execute'
  | 'api.invoke'
  | 'dialog.open'
  | 'event.emit'
  | 'form.patch'
  | 'form.replace'
  | 'grid.setRows'
  | 'http.execute'
  | 'pageFunction.execute'
  | 'message.error'
  | 'message.info'
  | 'message.success'
  | 'message.warning'
  | 'page.refresh'
  | 'router.push'
  | 'search.patch'
  | 'search.replace'
  | 'source.refresh'
  | 'source.refreshAll'
  | 'source.set';

export type LowCodeScriptCapabilityRequest = {
  id: number;
  name: LowCodeScriptCapabilityName;
  args: unknown[];
};

export type LowCodeScriptLogLevel = 'log' | 'info' | 'warn' | 'error';

export type LowCodeScriptContextSnapshot = {
  page: Record<string, unknown>;
  route: Record<string, unknown>;
  data: Record<string, unknown>;
  forms: Record<string, Record<string, unknown>>;
  searches: Record<string, Record<string, unknown>>;
  grids: Record<string, unknown>;
  event: Record<string, unknown>;
  policy?: LowCodeScriptPolicySnapshot;
};

export type LowCodeScriptPolicySnapshot = {
  apiNames?: string[];
  capabilities?: LowCodeScriptCapabilityName[];
};

export type LowCodeScriptSerializable =
  | null
  | boolean
  | number
  | string
  | LowCodeScriptSerializable[]
  | { [key: string]: LowCodeScriptSerializable };

export type LowCodeScriptExecutionLimits = {
  timeoutMs?: number;
  startupTimeoutMs?: number;
  memoryLimitBytes?: number;
  maxStackSizeBytes?: number;
  maxApiCalls?: number;
  maxPayloadBytes?: number;
};

export type LowCodeScriptExecutionMode = 'script' | 'function';

export type LowCodeScriptExecutionRequest = {
  script: string;
  context: LowCodeScriptContextSnapshot;
  /** Evaluate the source as a function value, invoke it, and await its result. */
  executionMode?: LowCodeScriptExecutionMode;
  limits?: LowCodeScriptExecutionLimits;
};

export type LowCodeScriptExecutionResult = {
  value: unknown;
  apiCalls: number;
  durationMs: number;
};

export type LowCodeScriptCapabilityHandler = (
  request: LowCodeScriptCapabilityRequest,
) => Promise<unknown> | unknown;

export type LowCodeScriptExecutor = (
  request: LowCodeScriptExecutionRequest,
  handleCapability: LowCodeScriptCapabilityHandler,
) => Promise<LowCodeScriptExecutionResult>;

export type RegisteredLowCodeScriptApi = {
  name: string;
  description?: string;
  signature?: string;
  insertText?: string;
  authorize?: (
    payload: Record<string, unknown>,
    context: LowCodeScriptContextSnapshot,
  ) => Promise<boolean> | boolean;
  handler: (
    payload: Record<string, unknown>,
    context: LowCodeScriptContextSnapshot,
  ) => Promise<unknown> | unknown;
};

export type LowCodeScriptApiRegistration =
  | Omit<RegisteredLowCodeScriptApi, 'name'>
  | RegisteredLowCodeScriptApi['handler'];

const scriptApiRegistry = new Map<string, RegisteredLowCodeScriptApi>();
let quickJsWorkerModuleReady: Promise<void> | undefined;

function readApiName(value: string) {
  return value.trim();
}

function readPositiveLimit(value: unknown, fallback: number, minimum = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.max(minimum, Math.floor(number))
    : fallback;
}

function serializedByteLength(value: LowCodeScriptSerializable) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function serializedValueByteLength(value: unknown) {
  return serializedByteLength(toLowCodeScriptSerializable(value));
}

function isSerializableRecord(
  value: LowCodeScriptSerializable,
): value is { [key: string]: LowCodeScriptSerializable } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactSerializableArray(
  value: LowCodeScriptSerializable[],
  fits: (candidate: LowCodeScriptSerializable) => boolean,
) {
  if (fits(value)) return value;
  if (!value.length) return fits([]) ? [] : undefined;

  let low = 0;
  let high = value.length;
  let best: LowCodeScriptSerializable[] | undefined = fits([]) ? [] : undefined;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = value.slice(0, mid);
    if (fits(candidate)) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function compactSerializableRecord(
  value: { [key: string]: LowCodeScriptSerializable },
  fits: (candidate: LowCodeScriptSerializable) => boolean,
) {
  if (fits(value)) return value;

  if (Array.isArray(value.rows)) {
    const { rows, ...rest } = value;
    const compactRows = compactSerializableArray(rows, (candidateRows) =>
      fits({ ...rest, rows: candidateRows })
    );
    if (compactRows) return { ...rest, rows: compactRows };
    if (fits({ rows: [] })) return { rows: [] };
  }

  const result: { [key: string]: LowCodeScriptSerializable } = {};
  if (!fits(result)) return undefined;
  for (const [key, item] of Object.entries(value)) {
    const candidate = { ...result, [key]: item };
    if (fits(candidate)) {
      result[key] = item;
      continue;
    }
    const compactItem = compactSerializableValue(item, (nextItem) =>
      fits({ ...result, [key]: nextItem })
    );
    if (typeof compactItem !== 'undefined') result[key] = compactItem;
  }
  return result;
}

function compactSerializableValue(
  value: LowCodeScriptSerializable,
  fits: (candidate: LowCodeScriptSerializable) => boolean,
): LowCodeScriptSerializable | undefined {
  if (fits(value)) return value;
  if (Array.isArray(value)) return compactSerializableArray(value, fits);
  if (isSerializableRecord(value)) return compactSerializableRecord(value, fits);
  if (typeof value === 'string') {
    let low = 0;
    let high = value.length;
    let best = '';
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = value.slice(0, mid);
      if (fits(candidate)) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return fits(best) ? best : undefined;
  }
  return undefined;
}

function readMaxPayloadBytes(value: unknown) {
  return readPositiveLimit(value, DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES);
}

export function compactLowCodeScriptContext(
  context: LowCodeScriptContextSnapshot,
  maxPayloadBytes = DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
): LowCodeScriptContextSnapshot {
  const limit = readMaxPayloadBytes(maxPayloadBytes);
  const snapshot = toLowCodeScriptSerializable(context) as LowCodeScriptContextSnapshot;
  if (serializedValueByteLength(snapshot) <= limit) return snapshot;

  const compact: LowCodeScriptContextSnapshot = {
    page: snapshot.page ?? {},
    route: snapshot.route ?? {},
    data: {},
    forms: {},
    searches: {},
    grids: {},
    event: snapshot.event ?? {},
    policy: snapshot.policy,
  };

  const fitsContext = (candidate: LowCodeScriptContextSnapshot) =>
    serializedValueByteLength(candidate) <= limit;
  const setSection = (
    section: 'data' | 'forms' | 'searches' | 'grids',
    value: Record<string, LowCodeScriptSerializable>,
  ) => {
    if (section === 'data') compact.data = value;
    else if (section === 'forms') compact.forms = value as Record<string, Record<string, unknown>>;
    else if (section === 'searches') compact.searches = value as Record<string, Record<string, unknown>>;
    else compact.grids = value;
  };
  const fitSectionValue = (
    section: 'data' | 'forms' | 'searches' | 'grids',
    key: string,
    value: LowCodeScriptSerializable,
  ) => {
    const current = compact[section] as Record<string, LowCodeScriptSerializable>;
    const fits = (candidateValue: LowCodeScriptSerializable) =>
      fitsContext({
        ...compact,
        [section]: { ...current, [key]: candidateValue },
      });
    const nextValue = compactSerializableValue(value, fits);
    if (typeof nextValue === 'undefined') return;
    setSection(section, { ...current, [key]: nextValue });
  };

  for (const section of ['forms', 'searches', 'grids', 'data'] as const) {
    const source = snapshot[section] as LowCodeScriptSerializable;
    if (!isSerializableRecord(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      fitSectionValue(section, key, value);
    }
  }

  if (fitsContext(compact)) return compact;

  return {
    page: snapshot.page ?? {},
    route: {},
    data: {},
    forms: {},
    searches: {},
    grids: {},
    event: {
      name: snapshot.event?.name ?? '',
      blockId: snapshot.event?.blockId ?? '',
      blockKind: snapshot.event?.blockKind ?? '',
      timestamp: snapshot.event?.timestamp ?? '',
    },
    policy: snapshot.policy,
  };
}

function writeLowCodeScriptLog(level: LowCodeScriptLogLevel, args: unknown[]) {
  if (level === 'info') {
    globalThis.console.info(...args);
    return;
  }
  if (level === 'warn') {
    globalThis.console.warn(...args);
    return;
  }
  if (level === 'error') {
    globalThis.console.error(...args);
    return;
  }
  globalThis.console.log(...args);
}

export function registerLowCodeScriptApi(
  name: string,
  registration: LowCodeScriptApiRegistration,
) {
  const normalizedName = readApiName(name);
  if (!normalizedName) throw new Error('Low-code script API name is required.');

  const api = typeof registration === 'function'
    ? { name: normalizedName, handler: registration }
    : { ...registration, name: normalizedName };
  scriptApiRegistry.set(normalizedName, api);

  return () => {
    if (scriptApiRegistry.get(normalizedName) === api) {
      scriptApiRegistry.delete(normalizedName);
    }
  };
}

export function unregisterLowCodeScriptApi(name: string) {
  return scriptApiRegistry.delete(readApiName(name));
}

export function getLowCodeScriptApi(name: string) {
  return scriptApiRegistry.get(readApiName(name));
}

export function getLowCodeScriptApiNames() {
  return [...scriptApiRegistry.keys()].sort();
}

export function getLowCodeScriptApiDefinitions() {
  return [...scriptApiRegistry.values()]
    .map(({ name, description, signature, insertText }) => ({
      name,
      description,
      signature,
      insertText,
    }))
    .sort((previous, next) => previous.name.localeCompare(next.name));
}

export function clearLowCodeScriptApis() {
  scriptApiRegistry.clear();
}

export async function invokeRegisteredLowCodeScriptApi(
  name: string,
  payload: Record<string, unknown>,
  context: LowCodeScriptContextSnapshot,
) {
  const api = getLowCodeScriptApi(name);
  if (!api) {
    throw new Error(`脚本 API "${name}" 未注册或当前用户无权调用。`);
  }

  const allowedApiNames = context.policy?.apiNames;
  if (!Array.isArray(allowedApiNames) || !allowedApiNames.includes(name)) {
    throw new Error(`脚本 API "${name}" 未注册或当前用户无权调用。`);
  }
  if (api.authorize && !await api.authorize(payload, context)) {
    throw new Error(`脚本 API "${name}" 未注册或当前用户无权调用。`);
  }

  return api.handler(payload, context);
}

let scriptExecutor: LowCodeScriptExecutor | undefined;

export function registerLowCodeScriptExecutor(executor: LowCodeScriptExecutor) {
  scriptExecutor = executor;
  return () => {
    if (scriptExecutor === executor) scriptExecutor = undefined;
  };
}

export function getLowCodeScriptExecutor() {
  return scriptExecutor;
}

function createLowCodeScriptWorker(): Worker {
  return new Worker(
    new URL('./script-runtime.worker.ts', import.meta.url),
    { type: 'module', name: 'lowcode-script-runtime' },
  );
}

export function preloadLowCodeScriptRuntime() {
  if (typeof Worker === 'undefined') return Promise.resolve();
  if (quickJsWorkerModuleReady) return quickJsWorkerModuleReady;

  quickJsWorkerModuleReady = new Promise<void>((resolve, reject) => {
    const worker = createLowCodeScriptWorker();
    const timeoutId = globalThis.setTimeout(() => {
      worker.terminate();
      quickJsWorkerModuleReady = undefined;
      reject(new Error('低代码脚本运行时预加载超时。'));
    }, DEFAULT_LOW_CODE_SCRIPT_STARTUP_TIMEOUT_MS);
    worker.addEventListener('message', (event: MessageEvent<Record<string, unknown>>) => {
      if (event.data.type === 'module-error') {
        clearTimeout(timeoutId);
        worker.terminate();
        quickJsWorkerModuleReady = undefined;
        reject(new Error(String(event.data.error || '低代码脚本运行时预加载失败。')));
        return;
      }
      if (event.data.type !== 'module-ready') return;
      clearTimeout(timeoutId);
      worker.terminate();
      resolve();
    });
    worker.addEventListener('error', (event) => {
      clearTimeout(timeoutId);
      worker.terminate();
      quickJsWorkerModuleReady = undefined;
      reject(new Error(event.message || '低代码脚本运行时预加载失败。'));
    });
  });

  return quickJsWorkerModuleReady;
}

export function createLowCodeWorkerScriptExecutor(): LowCodeScriptExecutor {
  return (request, handleCapability) => {
    if (typeof Worker === 'undefined') {
      throw new Error('当前环境不支持低代码脚本 Worker。');
    }

    void preloadLowCodeScriptRuntime().catch(() => undefined);
    const worker = createLowCodeScriptWorker();
    const requestId = `script_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeoutMs = readPositiveLimit(
      request.limits?.timeoutMs,
      DEFAULT_LOW_CODE_SCRIPT_TIMEOUT_MS,
      100,
    );
    const startupTimeoutMs = readPositiveLimit(
      request.limits?.startupTimeoutMs,
      DEFAULT_LOW_CODE_SCRIPT_STARTUP_TIMEOUT_MS,
      100,
    );

    return new Promise<LowCodeScriptExecutionResult>((resolve, reject) => {
      let settled = false;
      let executionStarted = false;
      let pendingCapabilities = 0;
      let executionTimeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
      let settle: (callback: () => void) => void;
      const scheduleExecutionTimeout = () => {
        if (executionTimeoutId) clearTimeout(executionTimeoutId);
        executionTimeoutId = globalThis.setTimeout(() => {
          settle(() => reject(new Error(`脚本执行超时（${timeoutMs}ms）。`)));
        }, timeoutMs + 250);
      };
      settle = (
        callback: () => void,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimeoutId);
        if (executionTimeoutId) clearTimeout(executionTimeoutId);
        worker.terminate();
        callback();
      };
      const startupTimeoutId = globalThis.setTimeout(() => {
        settle(() => reject(new Error(`脚本 Worker 启动超时（${startupTimeoutMs}ms）。`)));
      }, startupTimeoutMs);

      worker.addEventListener('message', (message: MessageEvent<Record<string, unknown>>) => {
        const data = message.data;
        if (data.type === 'module-error' && !executionStarted) {
          settle(() => reject(new Error(String(data.error || '脚本运行时加载失败。'))));
          return;
        }

        if (data.type === 'module-ready' && !executionStarted) {
          executionStarted = true;
          clearTimeout(startupTimeoutId);
          scheduleExecutionTimeout();
          return;
        }

        if (data.requestId !== requestId || settled) return;

        if (data.type === 'log') {
          const level = data.level;
          if (
            (level === 'log' || level === 'info' || level === 'warn' || level === 'error') &&
            Array.isArray(data.args)
          ) {
            writeLowCodeScriptLog(level, data.args);
          }
          return;
        }

        if (data.type === 'capability') {
          const capabilityRequest = data.request as LowCodeScriptCapabilityRequest;
          pendingCapabilities += 1;
          if (executionTimeoutId) clearTimeout(executionTimeoutId);
          Promise.resolve()
            .then(() => handleCapability(capabilityRequest))
            .then((value) => {
              if (settled) return;
              const serializedValue = toLowCodeScriptSerializable(value);
              const maxPayloadBytes = readPositiveLimit(
                request.limits?.maxPayloadBytes,
                DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
              );
              if (serializedByteLength(serializedValue) > maxPayloadBytes) {
                worker.postMessage({
                  type: 'capability-result',
                  requestId,
                  capabilityId: capabilityRequest.id,
                  ok: false,
                  error: `脚本 API 返回值超过载荷限制（${maxPayloadBytes} bytes）。`,
                });
                return;
              }
              worker.postMessage({
                type: 'capability-result',
                requestId,
                capabilityId: capabilityRequest.id,
                ok: true,
                value: serializedValue,
              });
            })
            .catch((error) => {
              if (settled) return;
              worker.postMessage({
                type: 'capability-result',
                requestId,
                capabilityId: capabilityRequest.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            })
            .finally(() => {
              pendingCapabilities = Math.max(0, pendingCapabilities - 1);
              if (!settled && pendingCapabilities === 0) scheduleExecutionTimeout();
            });
          return;
        }

        if (data.type === 'result') {
          settle(() => resolve(data.result as LowCodeScriptExecutionResult));
          return;
        }

        if (data.type === 'error') {
          settle(() => reject(new Error(String(data.error || '脚本执行失败。'))));
        }
      });

      worker.addEventListener('error', (event) => {
        settle(() => reject(new Error(event.message || '脚本 Worker 加载失败。')));
      });

      worker.postMessage(toLowCodeScriptSerializable({
        type: 'execute',
        requestId,
        request: {
          ...request,
          context: toLowCodeScriptSerializable(
            request.context,
          ) as LowCodeScriptContextSnapshot,
        },
      }));
    });
  };
}

export function toLowCodeScriptSerializable(
  value: unknown,
): LowCodeScriptSerializable {
  if (typeof value === 'undefined') return null;

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return null;
    return JSON.parse(serialized) as LowCodeScriptSerializable;
  } catch {
    throw new Error('脚本上下文和 API 返回值必须可序列化为 JSON。');
  }
}

export async function executeLowCodeScript(
  request: LowCodeScriptExecutionRequest,
  handleCapability: LowCodeScriptCapabilityHandler,
) {
  const executor = getLowCodeScriptExecutor() ?? createLowCodeWorkerScriptExecutor();
  return executor(request, handleCapability);
}
