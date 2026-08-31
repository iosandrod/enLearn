/** Compatibility worker entry. The QuickJS worker is implemented in runtime-core. */
/*
 * newQuickJSWASMModuleFromVariant(RELEASE_SYNC) -> setMemoryLimit -> setMaxStackSize
 * -> setInterruptHandler. The runtime injects const scriptThis = Object.freeze({
 * const scriptThis = Object.freeze({ $api: api, $form: formApi, $grid: gridApi, $source: sourceApi,
 * const node = Object.freeze({ call: (command, payload = {}) => call("node.runtime", command, payload) });
 * $node: node,
 * executeAction: (options) => call("action.execute", options),
 * executeHttp: (options) => call("http.execute", options),
 * executeFunction: (options) => call("pageFunction.execute", options),
 * typeof main === "function" -> main.call(this, this.event), and
 * createConfiguredFunctionSource -> __configuredFunction.call(this, this.event).
 * executionMode === 'function' -> createConfiguredFunctionSource.
 * const hostCall = globalThis.__lowCodeHostCall; const hostLog = globalThis.__lowCodeHostLog;
 * delete globalThis.__lowCodeHostCall; delete globalThis.__lowCodeHostLog;
 * new AsyncFunction("console", source); userScript.call(scriptThis, scriptConsole).
 * const scriptConsole = Object.freeze({ log: (...args) => hostLog('log', args), info: (...args) => hostLog('info', args), warn: (...args) => hostLog('warn', args), error: (...args) => hostLog('error', args) }); type: 'log'.
 */
export { default } from '../runtime-core/script-runtime.worker.ts';
