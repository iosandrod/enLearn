export declare const DEFAULT_LOW_CODE_SCRIPT_TIMEOUT_MS = 2000;
export declare const DEFAULT_LOW_CODE_SCRIPT_STARTUP_TIMEOUT_MS = 15000;
export declare const DEFAULT_LOW_CODE_SCRIPT_MEMORY_LIMIT_BYTES: number;
export declare const DEFAULT_LOW_CODE_SCRIPT_STACK_LIMIT_BYTES: number;
export declare const DEFAULT_LOW_CODE_SCRIPT_MAX_API_CALLS = 50;
export declare const DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES: number;
export type LowCodeScriptCapabilityName = 'action.execute' | 'api.invoke' | 'dialog.open' | 'event.emit' | 'form.patch' | 'form.replace' | 'grid.setRows' | 'http.execute' | 'pageFunction.execute' | 'message.error' | 'message.info' | 'message.success' | 'message.warning' | 'page.refresh' | 'router.push' | 'search.patch' | 'search.replace' | 'source.refresh' | 'source.refreshAll' | 'source.set';
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
export type LowCodeScriptSerializable = null | boolean | number | string | LowCodeScriptSerializable[] | {
    [key: string]: LowCodeScriptSerializable;
};
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
export type LowCodeScriptCapabilityHandler = (request: LowCodeScriptCapabilityRequest) => Promise<unknown> | unknown;
export type LowCodeScriptExecutor = (request: LowCodeScriptExecutionRequest, handleCapability: LowCodeScriptCapabilityHandler) => Promise<LowCodeScriptExecutionResult>;
export type RegisteredLowCodeScriptApi = {
    name: string;
    description?: string;
    signature?: string;
    insertText?: string;
    authorize?: (payload: Record<string, unknown>, context: LowCodeScriptContextSnapshot) => Promise<boolean> | boolean;
    handler: (payload: Record<string, unknown>, context: LowCodeScriptContextSnapshot) => Promise<unknown> | unknown;
};
export type LowCodeScriptApiRegistration = Omit<RegisteredLowCodeScriptApi, 'name'> | RegisteredLowCodeScriptApi['handler'];
export declare function registerLowCodeScriptApi(name: string, registration: LowCodeScriptApiRegistration): () => void;
export declare function unregisterLowCodeScriptApi(name: string): boolean;
export declare function getLowCodeScriptApi(name: string): RegisteredLowCodeScriptApi | undefined;
export declare function getLowCodeScriptApiNames(): string[];
export declare function getLowCodeScriptApiDefinitions(): {
    name: string;
    description: string | undefined;
    signature: string | undefined;
    insertText: string | undefined;
}[];
export declare function clearLowCodeScriptApis(): void;
export declare function invokeRegisteredLowCodeScriptApi(name: string, payload: Record<string, unknown>, context: LowCodeScriptContextSnapshot): Promise<unknown>;
export declare function registerLowCodeScriptExecutor(executor: LowCodeScriptExecutor): () => void;
export declare function getLowCodeScriptExecutor(): LowCodeScriptExecutor | undefined;
export declare function preloadLowCodeScriptRuntime(): Promise<void>;
export declare function compactLowCodeScriptContext(context: LowCodeScriptContextSnapshot, maxPayloadBytes?: number): LowCodeScriptContextSnapshot;
export declare function createLowCodeWorkerScriptExecutor(): LowCodeScriptExecutor;
export declare function toLowCodeScriptSerializable(value: unknown): LowCodeScriptSerializable;
export declare function executeLowCodeScript(request: LowCodeScriptExecutionRequest, handleCapability: LowCodeScriptCapabilityHandler): Promise<LowCodeScriptExecutionResult>;
