import type { LowCodeRuntimeEvent } from '../types/lowcode';
import type {
  LowCodeScriptCapabilityName,
  LowCodeScriptCapabilityRequest,
  LowCodeScriptContextSnapshot,
} from './scripts';

export type PrimaryScriptCapability = Extract<
  LowCodeScriptCapabilityName,
  'action.execute' | 'pageFunction.execute' | 'http.execute'
>;

export type ScriptExecutionContext = {
  event: LowCodeRuntimeEvent;
  scriptContext: LowCodeScriptContextSnapshot;
};

export type ScriptExecutionHandler = (
  options: Record<string, unknown>,
  context: ScriptExecutionContext,
) => Promise<unknown> | unknown;

function readOptions(args: unknown[], apiName: string) {
  const value = args[0];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${apiName} 参数必须是对象。`);
  }
  return value as Record<string, unknown>;
}

/** Shared strategy contract for the three public page-script execution APIs. */
export abstract class ScriptExecutor {
  abstract readonly capability: PrimaryScriptCapability;
  abstract readonly apiName: 'executeAction' | 'executeFunction' | 'executeHttp';

  constructor(private readonly handler: ScriptExecutionHandler) {}

  execute(
    request: LowCodeScriptCapabilityRequest,
    context: ScriptExecutionContext,
  ) {
    return this.handler(readOptions(request.args, this.apiName), context);
  }
}

export class NodeActionExecutor extends ScriptExecutor {
  readonly capability = 'action.execute' as const;
  readonly apiName = 'executeAction' as const;
}

export class PageFunctionExecutor extends ScriptExecutor {
  readonly capability = 'pageFunction.execute' as const;
  readonly apiName = 'executeFunction' as const;
}

export class HttpExecutor extends ScriptExecutor {
  readonly capability = 'http.execute' as const;
  readonly apiName = 'executeHttp' as const;
}

/** Registry-based dispatcher; adding behavior no longer grows an if/else chain. */
export class ScriptExecutorRegistry {
  private readonly executors = new Map<PrimaryScriptCapability, ScriptExecutor>();

  constructor(executors: ScriptExecutor[]) {
    executors.forEach((executor) => this.executors.set(executor.capability, executor));
  }

  has(capability: LowCodeScriptCapabilityName): capability is PrimaryScriptCapability {
    return this.executors.has(capability as PrimaryScriptCapability);
  }

  execute(
    request: LowCodeScriptCapabilityRequest,
    context: ScriptExecutionContext,
  ) {
    const executor = this.executors.get(request.name as PrimaryScriptCapability);
    if (!executor) throw new Error(`脚本能力 "${request.name}" 未注册。`);
    return executor.execute(request, context);
  }
}
