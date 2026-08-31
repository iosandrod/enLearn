import { executeTriggerWorkflowFunction } from '../workflow/trigger/trigger-workflow.script-runtime';

const DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS = 2_000;
const MAX_REMOTE_RUNTIME_TIMEOUT_MS = 5_000;
const DEFAULT_REMOTE_RUNTIME_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_REMOTE_RUNTIME_PAYLOAD_BYTES = 25 * 1024 * 1024;
const MAX_REMOTE_RUNTIME_SOURCE_BYTES = 256 * 1024;
const MAX_REMOTE_RUNTIME_EFFECTS = 100;

export const LOW_CODE_REMOTE_EFFECT_CAPABILITIES = [
  'form.prepare', 'form.submit', 'message.show', 'page.exit',
  'page.navigateToEdit', 'page.print', 'page.setMode',
  'records.delete', 'records.update', 'service.invoke',
] as const;

export type LowCodeRemoteRuntimeSnapshot = {
  page: Record<string, unknown>;
  route: Record<string, unknown>;
  data: Record<string, unknown>;
  forms: Record<string, unknown>;
  searches: Record<string, unknown>;
  grids: Record<string, unknown>;
  event: Record<string, unknown>;
  runtimeSpec?: Record<string, unknown>;
};

export type LowCodeRemoteRuntimeEffect = {
  type: string;
  [key: string]: unknown;
};

export type LowCodeRemoteRuntimeExecution = {
  value: unknown;
  effects: LowCodeRemoteRuntimeEffect[];
  resultEffect?: number;
};

export type LowCodeRemoteRuntimeLimits = {
  timeoutMs?: unknown;
  maxPayloadBytes?: unknown;
};

export type ExecuteLowCodeRemoteRuntimeOptions = {
  sourceCode: string;
  args: Record<string, unknown>;
  snapshot: LowCodeRemoteRuntimeSnapshot;
  limits?: LowCodeRemoteRuntimeLimits;
  allowedEffects?: string[];
};

function readPositiveInteger(value: unknown, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(maximum, Math.floor(number))
    : fallback;
}

function byteLength(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

function serializeJson(value: unknown, label: string, maxBytes: number) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value === undefined ? null : value);
  } catch {
    throw new Error(`${label}必须可以序列化为 JSON。`);
  }
  if (byteLength(serialized) > maxBytes) {
    throw new Error(`${label}超过远程运行时载荷限制（${maxBytes} bytes）。`);
  }
  return serialized;
}

function createRemoteFunctionSource(sourceCode: string) {
  const source = sourceCode.trim().replace(/;\s*$/, '');
  return `async function executeLowCodeRemoteRuntime(input) {
    "use strict";
    const configuredFunction = (\n${source}\n);
    if (typeof configuredFunction !== "function") {
      throw new TypeError("数据库运行时 source_code 必须是函数。");
    }
    const runtimeContext = Object.freeze(input.context || {});
    const scriptThis = Object.freeze({ context: runtimeContext });
    return await configuredFunction.call(scriptThis, Object.freeze({
      args: input.payload || {},
      context: runtimeContext,
      event: runtimeContext.event || {},
      runtimeSpec: runtimeContext.runtimeSpec || {}
    }));
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeExecution(
  value: unknown,
  allowedEffects: string[],
): LowCodeRemoteRuntimeExecution {
  if (!isRecord(value) || !Array.isArray(value.effects)) {
    return { value, effects: [] };
  }
  if (value.effects.length > MAX_REMOTE_RUNTIME_EFFECTS) {
    throw new Error(`数据库运行时效果不能超过 ${MAX_REMOTE_RUNTIME_EFFECTS} 个。`);
  }

  const allowed = new Set(allowedEffects);
  const effects = value.effects.map((effect, index) => {
    if (!isRecord(effect) || typeof effect.type !== 'string' || !effect.type.trim()) {
      throw new Error(`数据库运行时效果 ${index + 1} 格式不正确。`);
    }
    const type = effect.type.trim();
    if (!allowed.has(type)) {
      throw new Error(`数据库运行时效果 "${type}" 未在 capabilities 中授权。`);
    }
    return { ...effect, type } as LowCodeRemoteRuntimeEffect;
  });

  const resultEffectValue = value.resultEffect;
  const resultEffect = typeof resultEffectValue === 'number' && Number.isInteger(resultEffectValue)
    ? resultEffectValue
    : undefined;
  if (typeof resultEffect !== 'undefined' && (resultEffect < 0 || resultEffect >= effects.length)) {
    throw new Error('数据库运行时 resultEffect 超出效果列表范围。');
  }

  return {
    value: Object.prototype.hasOwnProperty.call(value, 'value') ? value.value : null,
    effects,
    ...(typeof resultEffect === 'number' ? { resultEffect } : {}),
  };
}

export async function executeLowCodeRemoteRuntime(
  options: ExecuteLowCodeRemoteRuntimeOptions,
) {
  const sourceCode = options.sourceCode.trim();
  if (!sourceCode) throw new Error('数据库运行时 source_code 不能为空。');
  if (byteLength(sourceCode) > MAX_REMOTE_RUNTIME_SOURCE_BYTES) {
    throw new Error(`数据库运行时 source_code 不能超过 ${MAX_REMOTE_RUNTIME_SOURCE_BYTES} bytes。`);
  }

  const timeoutMs = readPositiveInteger(
    options.limits?.timeoutMs,
    DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS,
    MAX_REMOTE_RUNTIME_TIMEOUT_MS,
  );
  const maxPayloadBytes = readPositiveInteger(
    options.limits?.maxPayloadBytes,
    DEFAULT_REMOTE_RUNTIME_PAYLOAD_BYTES,
    MAX_REMOTE_RUNTIME_PAYLOAD_BYTES,
  );
  const snapshot = JSON.parse(serializeJson(options.snapshot, '远程运行时 context', maxPayloadBytes));
  const args = JSON.parse(serializeJson(options.args, '远程运行时 args', maxPayloadBytes));
  const value = await executeTriggerWorkflowFunction(
    createRemoteFunctionSource(sourceCode),
    {
      payload: args,
      variables: {},
      context: snapshot,
    },
    undefined,
    timeoutMs,
  );
  serializeJson(value, '远程运行时返回值', maxPayloadBytes);
  return normalizeExecution(value, options.allowedEffects ?? []);
}
