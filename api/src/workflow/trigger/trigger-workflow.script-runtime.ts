import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSDeferredPromise,
  type QuickJSHandle
} from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { isRecord, type JsonRecord } from './trigger-workflow.helpers';

const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_CAPABILITY_CALLS = 100;
const quickJsModulePromise = newQuickJSWASMModuleFromVariant(RELEASE_SYNC);

export type TriggerWorkflowScriptContext = {
  payload: JsonRecord;
  variables: JsonRecord;
  previousOutput?: unknown;
  context: JsonRecord;
};

export type TriggerWorkflowScriptCapability = (
  name: string,
  args: unknown[]
) => Promise<unknown>;

export async function executeTriggerWorkflowFunction(
  functionSource: string,
  snapshot: TriggerWorkflowScriptContext,
  capability?: TriggerWorkflowScriptCapability,
  timeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS
) {
  validateFunctionSource(functionSource);
  const module = await quickJsModulePromise;
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(DEFAULT_MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = { value: Date.now() + timeoutMs };
  runtime.setInterruptHandler(() => Date.now() >= deadline.value);
  const vm = runtime.newContext();
  const deferred = new Set<QuickJSDeferredPromise>();
  let capabilityCalls = 0;

  try {
    const hostCall = vm.newFunction('__workflowHostCall', (nameHandle, argsHandle) => {
      if (!capability) throw new Error('This workflow function has no host capabilities.');
      capabilityCalls += 1;
      if (capabilityCalls > MAX_CAPABILITY_CALLS) {
        throw new Error(`Workflow function exceeded ${MAX_CAPABILITY_CALLS} capability calls.`);
      }

      const name = vm.getString(nameHandle);
      const args = parseJsonArray(vm.getString(argsHandle));
      const promise = vm.newPromise();
      deferred.add(promise);
      deadline.value = Number.POSITIVE_INFINITY;
      void capability(name, args).then(
        (value) => {
          const handle = vm.newString(stringifyJson(value));
          promise.resolve(handle);
          handle.dispose();
        },
        (error) => {
          const handle = vm.newError(error instanceof Error ? error.message : String(error));
          promise.reject(handle);
          handle.dispose();
        }
      ).finally(() => {
        deferred.delete(promise);
        if (!deferred.size) deadline.value = Date.now() + timeoutMs;
        vm.runtime.executePendingJobs();
        promise.dispose();
      });
      return promise.handle;
    });
    vm.setProp(vm.global, '__workflowHostCall', hostCall);
    hostCall.dispose();

    const evaluation = vm.evalCode(
      createScriptSource(functionSource, snapshot, Boolean(capability)),
      'trigger-workflow-function.js',
      { type: 'global' }
    );
    if ('error' in evaluation && evaluation.error) {
      const errorHandle = evaluation.error;
      const message = readQuickJsError(vm.dump(errorHandle));
      errorHandle.dispose();
      throw new Error(message);
    }

    const promiseHandle = evaluation.value;
    const resolvedPromise = vm.resolvePromise(promiseHandle);
    runtime.executePendingJobs();
    const resolved = await resolvedPromise;
    promiseHandle.dispose();
    if ('error' in resolved && resolved.error) {
      const errorHandle = resolved.error;
      const message = readQuickJsError(vm.dump(errorHandle));
      errorHandle.dispose();
      throw new Error(message);
    }

    const value = vm.dump(resolved.value);
    resolved.value.dispose();
    return JSON.parse(stringifyJson(value)) as unknown;
  } finally {
    deferred.forEach((promise) => promise.dispose());
    vm.dispose();
    runtime.dispose();
  }
}

function createScriptSource(
  functionSource: string,
  snapshot: TriggerWorkflowScriptContext,
  capabilitiesEnabled: boolean
) {
  const source = functionSource.trim().replace(/;\s*$/, '');
  const contextJson = stringifyJson(snapshot);
  return `
(async function executeTriggerWorkflowFunction() {
  "use strict";
  const snapshot = JSON.parse(${JSON.stringify(contextJson)});
  const call = async (name, ...args) => {
    const result = await globalThis.__workflowHostCall(name, JSON.stringify(args));
    return JSON.parse(result);
  };
  const createSupabaseProxy = (path = []) => {
    const target = function () {};
    return new Proxy(target, {
      get(_target, property) {
        if (property === "then") {
          const last = path[path.length - 1];
          if (!last || last.kind !== "method") return undefined;
          return (resolve, reject) =>
            call("supabase.operation", path).then(resolve, reject);
        }
        if (property === "catch" || property === "finally") {
          const last = path[path.length - 1];
          if (!last || last.kind !== "method") return undefined;
          return (...args) =>
            call("supabase.operation", path)[property](...args);
        }
        if (typeof property !== "string") return undefined;
        return createSupabaseProxy([
          ...path,
          { kind: "property", name: property }
        ]);
      },
      apply(_target, _thisArg, args) {
        const last = path[path.length - 1];
        if (!last || last.kind !== "property") {
          throw new TypeError("Supabase API path is not callable.");
        }
        return createSupabaseProxy([
          ...path.slice(0, -1),
          { kind: "method", name: last.name, args }
        ]);
      }
    });
  };
  const context = ${capabilitiesEnabled ? `Object.freeze({
    ...snapshot.context,
    http: Object.freeze({
      request: (url, init = {}) => call("http.request", url, init),
      get: (url, init = {}) => call("http.request", url, { ...init, method: "GET" }),
      post: (url, body, init = {}) => call("http.request", url, { ...init, method: "POST", body }),
      put: (url, body, init = {}) => call("http.request", url, { ...init, method: "PUT", body }),
      patch: (url, body, init = {}) => call("http.request", url, { ...init, method: "PATCH", body }),
      delete: (url, init = {}) => call("http.request", url, { ...init, method: "DELETE" })
    }),
    supabase: Object.freeze(createSupabaseProxy()),
    baseService: Object.freeze({
      invoke: (serviceName, serviceMethod, postData = {}) =>
        call("baseService.invoke", serviceName, serviceMethod, postData)
    })
  })` : 'Object.freeze(snapshot.context)'};
  const configuredFunction = (\n${source}\n);
  if (typeof configuredFunction !== "function") {
    throw new TypeError("Configured workflow value must be a function.");
  }
  return await configuredFunction({
    payload: snapshot.payload,
    variables: snapshot.variables,
    previousOutput: snapshot.previousOutput,
    context
  });
})()
`;
}

function validateFunctionSource(source: string) {
  if (!source.trim()) throw new Error('Workflow function source is required.');
  if (/\bimport\s*(?:\(|[\s\S]*?\bfrom\b)/.test(source)) {
    throw new Error('Workflow functions cannot use import.');
  }
  if (/\bexport\s+(?:default\b|\{|const\b|let\b|var\b|function\b|class\b)/.test(source)) {
    throw new Error('Workflow functions cannot use export.');
  }
}

function parseJsonArray(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Workflow capability arguments are invalid.');
  return parsed;
}

function stringifyJson(value: unknown) {
  const result = JSON.stringify(value === undefined ? null : value);
  if (typeof result !== 'string') throw new Error('Workflow values must be JSON serializable.');
  return result;
}

function readQuickJsError(value: unknown) {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    const message = typeof value.message === 'string' ? value.message : stringifyJson(value);
    const name = typeof value.name === 'string' ? value.name : '';
    return name && !message.startsWith(name) ? `${name}: ${message}` : message;
  }
  return String(value ?? 'Workflow function failed.');
}
