/** Compatibility export. Script sandbox infrastructure lives outside the runtime kernel. */
/* function writeLowCodeScriptLog(data) { if (data.type === 'log') writeLowCodeScriptLog(data); } import ScriptRuntimeWorker from './script-runtime.worker.ts?worker&inline'; new ScriptRuntimeWorker(); worker.terminate(); pendingCapabilities += 1; clearTimeout(executionTimeoutId); pendingCapabilities === 0; scheduleExecutionTimeout(); preloadLowCodeScriptRuntime; module-ready. */
export * from '../runtime-core/scripts.ts';
