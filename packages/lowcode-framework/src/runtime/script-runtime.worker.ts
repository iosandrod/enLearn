/// <reference lib="webworker" />

// Vite replaces the `?worker&inline` import with a Worker factory. The export
// keeps direct Node-side source inspection from failing before Vite transforms it.
export default undefined;

import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import {
  DEFAULT_LOW_CODE_SCRIPT_MAX_API_CALLS,
  DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
  DEFAULT_LOW_CODE_SCRIPT_MEMORY_LIMIT_BYTES,
  DEFAULT_LOW_CODE_SCRIPT_STACK_LIMIT_BYTES,
  DEFAULT_LOW_CODE_SCRIPT_TIMEOUT_MS,
  type LowCodeScriptCapabilityName,
  type LowCodeScriptCapabilityRequest,
  type LowCodeScriptExecutionRequest,
  type LowCodeScriptExecutionResult,
  type LowCodeScriptLogLevel,
} from './scripts.ts';

type ExecuteMessage = {
  type: 'execute';
  requestId: string;
  request: LowCodeScriptExecutionRequest;
};

type CapabilityResultMessage = {
  type: 'capability-result';
  requestId: string;
  capabilityId: number;
  ok: boolean;
  value?: unknown;
  error?: string;
};

type ActiveExecution = {
  deadline: { value: number };
  requestId: string;
  deferred: Map<number, QuickJSDeferredPromise>;
  maxPayloadBytes: number;
  timeoutMs: number;
  vm: QuickJSContext;
};

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const activeExecutions = new Map<string, ActiveExecution>();
const quickJsModulePromise = newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
quickJsModulePromise.then(
  () => workerScope.postMessage({ type: 'module-ready' }),
  (error) => workerScope.postMessage({
    type: 'module-error',
    error: error instanceof Error ? error.message : String(error),
  }),
);
const allowedCapabilityNames = new Set<LowCodeScriptCapabilityName>([
  'action.execute',
  'api.invoke',
  'dialog.open',
  'event.emit',
  'form.patch',
  'form.replace',
  'grid.setRows',
  'http.execute',
  'pageFunction.execute',
  'message.error',
  'message.info',
  'message.success',
  'message.warning',
  'page.refresh',
  'router.push',
  'search.patch',
  'search.replace',
  'source.refresh',
  'source.refreshAll',
  'source.set',
]);
const allowedLogLevels = new Set<LowCodeScriptLogLevel>([
  'log',
  'info',
  'warn',
  'error',
]);

function toPositiveInteger(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function serialize(value: unknown) {
  try {
    const result = JSON.stringify(typeof value === 'undefined' ? null : value);
    if (typeof result !== 'string') throw new Error('JSON serialization returned no value.');
    return result;
  } catch {
    throw new Error('脚本上下文、参数和返回值必须可序列化为 JSON。');
  }
}

function serializeWithLimit(value: unknown, maxPayloadBytes: number, label: string) {
  const result = serialize(value);
  if (byteLength(result) > maxPayloadBytes) {
    throw new Error(`${label}超过载荷限制（${maxPayloadBytes} bytes）。`);
  }
  return result;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function errorMessage(vm: QuickJSContext, handle: QuickJSHandle) {
  const dumped = vm.dump(handle) as { name?: unknown; message?: unknown; stack?: unknown } | unknown;
  if (typeof dumped === 'string') return dumped;
  if (dumped && typeof dumped === 'object') {
    const record = dumped as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : serialize(record);
    const name = typeof record.name === 'string' ? record.name : '';
    return name && !message.startsWith(name) ? `${name}: ${message}` : message;
  }
  return String(dumped ?? '脚本执行失败。');
}

function createConfiguredFunctionSource(script: string) {
  const functionExpression = script.trim().replace(/;\s*$/, '');
  const functionDefinition = `const __configuredFunction = (\n${functionExpression}\n);`;

  return `"use strict";\n${functionDefinition}\n\nif (typeof __configuredFunction !== "function") {\n  throw new TypeError("Configured value must be a function.");\n}\nreturn await __configuredFunction.call(this, this.event);\n`;
}

function createScriptSource(request: LowCodeScriptExecutionRequest, contextJson: string) {
  const userScriptSource = request.executionMode === 'function'
    ? createConfiguredFunctionSource(request.script)
    : `"use strict";\n${request.script}\n\nif (typeof main === "function") {\n  return await main.call(this, this.event);\n}\n`;
  return `
(async function executeLowCodeButtonScript() {
  "use strict";
  const snapshot = JSON.parse(${JSON.stringify(contextJson)});
  const hostCall = globalThis.__lowCodeHostCall;
  const hostLog = globalThis.__lowCodeHostLog;
  delete globalThis.__lowCodeHostCall;
  delete globalThis.__lowCodeHostLog;
  const call = async (name, ...args) => {
    const response = await hostCall(name, JSON.stringify(args));
    return JSON.parse(response);
  };
  const writeLog = (level, args) => {
    let serialized;
    try {
      serialized = JSON.stringify(args);
    } catch {
      serialized = JSON.stringify(args.map((value) => String(value)));
    }
    hostLog(level, serialized);
  };
  const scriptConsole = Object.freeze({
    log: (...args) => writeLog("log", args),
    info: (...args) => writeLog("info", args),
    warn: (...args) => writeLog("warn", args),
    error: (...args) => writeLog("error", args),
  });
  const freeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  };
  const formApi = Object.freeze({
    get: (blockId) => snapshot.forms[blockId],
    patch: (blockId, values) => call("form.patch", blockId, values),
    replace: (blockId, values) => call("form.replace", blockId, values),
  });
  const gridApi = Object.freeze({
    get: (blockId) => snapshot.grids[blockId],
    setRows: (blockId, rows) => call("grid.setRows", blockId, rows),
  });
  const sourceApi = Object.freeze({
    get: (sourceKey) => snapshot.data[sourceKey],
    set: (sourceKey, value) => call("source.set", sourceKey, value),
    refresh: (sourceKey) => call("source.refresh", sourceKey),
    refreshAll: () => call("source.refreshAll"),
  });
  const api = Object.freeze({
    invoke: (name, payload = {}) => call("api.invoke", name, payload),
  });
  const dialog = Object.freeze({
    open: (config) => call("dialog.open", config),
  });
  const events = Object.freeze({
    emit: (name, payload = {}) => call("event.emit", name, payload),
  });
  const message = Object.freeze({
    success: (text) => call("message.success", text),
    info: (text) => call("message.info", text),
    warning: (text) => call("message.warning", text),
    error: (text) => call("message.error", text),
  });
  const scriptThis = Object.freeze({
    context: freeze(snapshot),
    page: snapshot.page,
    route: snapshot.route,
    data: snapshot.data,
    forms: snapshot.forms,
    searches: snapshot.searches,
    grids: snapshot.grids,
    event: snapshot.event,
    $api: api,
    $form: formApi,
    $grid: gridApi,
    $search: Object.freeze({
      get: (sourceKey) => snapshot.searches[sourceKey],
      patch: (sourceKey, values) => call("search.patch", sourceKey, values),
      replace: (sourceKey, values) => call("search.replace", sourceKey, values),
    }),
    $source: sourceApi,
    $page: Object.freeze({ refresh: () => call("page.refresh") }),
    $router: Object.freeze({ push: (to) => call("router.push", to) }),
    $message: message,
    $dialog: dialog,
    $events: events,
    executeAction: (options) => call("action.execute", options),
    executeHttp: (options) => call("http.execute", options),
    executeFunction: (options) => call("pageFunction.execute", options),
  });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const userScript = new AsyncFunction("console", ${JSON.stringify(userScriptSource)});
  return await userScript.call(scriptThis, scriptConsole);
})()
`;
}

function validateScriptSource(script: string) {
  if (/\bimport\s*(?:\(|[\s\S]*?\bfrom\b)/.test(script)) {
    throw new Error('按钮脚本不允许使用动态 import。');
  }

  if (/\bexport\s+(?:default\b|\{|const\b|let\b|var\b|function\b|class\b)/.test(script)) {
    throw new Error('按钮脚本不允许使用 export。');
  }
}

async function execute(message: ExecuteMessage) {
  const requestStartedAt = Date.now();
  const limits = message.request.limits ?? {};
  const timeoutMs = toPositiveInteger(limits.timeoutMs, DEFAULT_LOW_CODE_SCRIPT_TIMEOUT_MS);
  const maxApiCalls = toPositiveInteger(limits.maxApiCalls, DEFAULT_LOW_CODE_SCRIPT_MAX_API_CALLS);
  const maxPayloadBytes = toPositiveInteger(
    limits.maxPayloadBytes,
    DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
  );
  const contextJson = serialize(message.request.context);
  validateScriptSource(message.request.script);
  if (byteLength(contextJson) > maxPayloadBytes) {
    throw new Error(`页面上下文超过脚本载荷限制（${maxPayloadBytes} bytes）。`);
  }

  const QuickJS = await quickJsModulePromise;
  const executionStartedAt = Date.now();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(toPositiveInteger(
    limits.memoryLimitBytes,
    DEFAULT_LOW_CODE_SCRIPT_MEMORY_LIMIT_BYTES,
  ));
  runtime.setMaxStackSize(toPositiveInteger(
    limits.maxStackSizeBytes,
    DEFAULT_LOW_CODE_SCRIPT_STACK_LIMIT_BYTES,
  ));
  const deadline = { value: executionStartedAt + timeoutMs };
  runtime.setInterruptHandler(() => Date.now() >= deadline.value);
  const vm = runtime.newContext();
  const deferred = new Map<number, QuickJSDeferredPromise>();
  activeExecutions.set(message.requestId, {
    deadline,
    requestId: message.requestId,
    deferred,
    maxPayloadBytes,
    timeoutMs,
    vm,
  });
  let apiCalls = 0;
  let logCalls = 0;
  let capabilityId = 0;

  try {
    const hostCall = vm.newFunction('__lowCodeHostCall', (nameHandle, argsHandle) => {
      apiCalls += 1;
      if (apiCalls > maxApiCalls) {
        throw new Error(`脚本 API 调用次数超过限制（${maxApiCalls}）。`);
      }

      const name = vm.getString(nameHandle) as LowCodeScriptCapabilityName;
      if (!allowedCapabilityNames.has(name)) {
        throw new Error(`脚本能力 "${name}" 未注册。`);
      }
      const argsJson = vm.getString(argsHandle);
      if (byteLength(argsJson) > maxPayloadBytes) {
        throw new Error(`脚本 API 参数超过载荷限制（${maxPayloadBytes} bytes）。`);
      }

      let args: unknown;
      try {
        args = JSON.parse(argsJson);
      } catch {
        throw new Error('脚本 API 参数必须可序列化为 JSON。');
      }
      if (!Array.isArray(args)) throw new Error('脚本 API 参数格式无效。');

      const id = ++capabilityId;
      const promise = vm.newPromise();
      deferred.set(id, promise);
      deadline.value = Number.POSITIVE_INFINITY;
      const request: LowCodeScriptCapabilityRequest = { id, name, args };
      workerScope.postMessage({
        type: 'capability',
        requestId: message.requestId,
        request,
      });
      return promise.handle;
    });
    vm.setProp(vm.global, '__lowCodeHostCall', hostCall);
    hostCall.dispose();

    const hostLog = vm.newFunction('__lowCodeHostLog', (levelHandle, argsHandle) => {
      logCalls += 1;
      if (logCalls > maxApiCalls) {
        throw new Error(`Script log count exceeds the limit (${maxApiCalls}).`);
      }

      const level = vm.getString(levelHandle) as LowCodeScriptLogLevel;
      if (!allowedLogLevels.has(level)) {
        throw new Error(`Script log level "${level}" is not supported.`);
      }
      const argsJson = vm.getString(argsHandle);
      if (byteLength(argsJson) > maxPayloadBytes) {
        throw new Error(`Script log payload exceeds the limit (${maxPayloadBytes} bytes).`);
      }

      let args: unknown;
      try {
        args = JSON.parse(argsJson);
      } catch {
        throw new Error('Script log arguments must be JSON serializable.');
      }
      if (!Array.isArray(args)) throw new Error('Script log arguments are invalid.');

      workerScope.postMessage({
        type: 'log',
        requestId: message.requestId,
        level,
        args,
      });
    });
    vm.setProp(vm.global, '__lowCodeHostLog', hostLog);
    hostLog.dispose();

    const evaluation = vm.evalCode(
      createScriptSource(message.request, contextJson),
      'lowcode-button-script.js',
      { type: 'global' },
    );
    if ('error' in evaluation) {
      const error = errorMessage(vm, evaluation.error);
      evaluation.error.dispose();
      throw new Error(error);
    }

    const promiseHandle = evaluation.value;
    const resolvedPromise = vm.resolvePromise(promiseHandle);
    runtime.executePendingJobs();
    const resolved = await resolvedPromise;
    promiseHandle.dispose();
    if ('error' in resolved) {
      const error = errorMessage(vm, resolved.error);
      resolved.error.dispose();
      throw new Error(error);
    }

    const value = vm.dump(resolved.value);
    resolved.value.dispose();
    serializeWithLimit(value, maxPayloadBytes, '脚本返回值');
    const result: LowCodeScriptExecutionResult = {
      value,
      apiCalls,
      durationMs: Date.now() - requestStartedAt,
    };
    workerScope.postMessage({ type: 'result', requestId: message.requestId, result });
  } finally {
    activeExecutions.delete(message.requestId);
    deferred.forEach((promise) => promise.dispose());
    vm.dispose();
    runtime.dispose();
  }
}

function handleCapabilityResult(message: CapabilityResultMessage) {
  const active = activeExecutions.get(message.requestId);
  const promise = active?.deferred.get(message.capabilityId);
  if (!active || !promise) return;
  active.deferred.delete(message.capabilityId);
  if (active.deferred.size === 0) {
    active.deadline.value = Date.now() + active.timeoutMs;
  }
  try {
    if (message.ok) {
      const resultJson = serializeWithLimit(
        message.value,
        active.maxPayloadBytes,
        '脚本 API 返回值',
      );
      const handle = active.vm.newString(resultJson);
      promise.resolve(handle);
      handle.dispose();
    } else {
      const errorHandle = active.vm.newError(message.error || '脚本 API 调用失败。');
      promise.reject(errorHandle);
      errorHandle.dispose();
    }
  } catch (error) {
    const errorHandle = active.vm.newError(
      error instanceof Error ? error.message : String(error),
    );
    promise.reject(errorHandle);
    errorHandle.dispose();
  }

  promise.settled.then(() => {
    active.vm.runtime.executePendingJobs();
    promise.dispose();
  });
}

workerScope.addEventListener('message', (event: MessageEvent<ExecuteMessage | CapabilityResultMessage>) => {
  const message = event.data;
  if (message.type === 'capability-result') {
    handleCapabilityResult(message);
    return;
  }

  void execute(message).catch((error) => {
    workerScope.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
});
}
