import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compactLowCodeScriptContext,
  clearLowCodeScriptApis,
  getLowCodeScriptApiNames,
  invokeRegisteredLowCodeScriptApi,
  registerLowCodeScriptApi,
  registerLowCodeScriptExecutor,
  executeLowCodeScript,
} from '../../packages/lowcode-framework/src/runtime/scripts.ts';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [rendererSource, rendererInteractionsSource, workerSource, scriptsSource, buttonMaterialSource, converterSource, monacoTypesSource, schemaSource, apiSchemaSource, nodeActionRegistrySource, nodeActionMigration] =
  await Promise.all([
    readFile(new URL('runtime/lowcode-page-script-runtime.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/useLowCodePageRenderer.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/script-runtime.worker.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/scripts.ts', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/button-group/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/visual-converters/lowcode-button-group/index.ts', frameworkRoot), 'utf8'),
    readFile(new URL('visual-editor/components/button-group-designer/button-script-monaco.ts', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/schema.ts', frameworkRoot), 'utf8'),
    readFile(new URL('../../api/src/lowcode-service/lowcode.schema.ts', import.meta.url), 'utf8'),
    readFile(new URL('runtime/node-action-registry.ts', frameworkRoot), 'utf8'),
    readFile(new URL('../../supabase/migrations/20260826220000_database_node_actions.sql', import.meta.url), 'utf8'),
  ]);

assert.match(
  rendererSource,
  /executeLowCodeScript\([\s\S]*?handleScriptCapability/,
  'Published button scripts must execute through the registered safe script runtime.',
);
assert.match(
  rendererSource,
  /compactLowCodeScriptContext\([\s\S]*?scriptPolicy\?\.limits\?\.maxPayloadBytes/,
  'Button script contexts must be compacted before entering the isolated worker payload limit.',
);
assert.doesNotMatch(
  rendererSource,
  /new Function\s*\(|\beval\s*\(/,
  'The page renderer must not execute user scripts in the browser realm.',
);
assert.match(
  workerSource,
  /newQuickJSWASMModuleFromVariant\(RELEASE_SYNC\)[\s\S]*?setMemoryLimit[\s\S]*?setMaxStackSize[\s\S]*?setInterruptHandler/,
  'The isolated QuickJS worker must enforce memory, stack, and CPU limits.',
);
assert.match(
  workerSource,
  /const scriptThis = Object\.freeze\([\s\S]*?\$api:[\s\S]*?\$form:[\s\S]*?\$grid:[\s\S]*?\$source:/,
  'Scripts must receive a frozen this capability object with registered APIs.',
);
assert.match(
  workerSource,
  /const node = Object\.freeze\([\s\S]*?call: \(command, payload = \{\}\) => call\("node\.runtime"[\s\S]*?\$node: node/,
  'Database node actions must use the generic node runtime capability.',
);
assert.match(
  workerSource,
  /executeAction: \(options\) => call\("action\.execute", options\)[\s\S]*?executeHttp: \(options\) => call\("http\.execute", options\)[\s\S]*?executeFunction: \(options\) => call\("pageFunction\.execute", options\)/,
  'Scripts must receive the unified object-parameter entry points.',
);
assert.match(
  workerSource,
  /typeof main === "function"[\s\S]*?main\.call\(this, this\.event\)/,
  'A declared async main function must be invoked automatically with the script this object.',
);
assert.match(
  workerSource,
  /createConfiguredFunctionSource[\s\S]*?__configuredFunction\.call\(this, this\.event\)[\s\S]*?executionMode === 'function'[\s\S]*?createConfiguredFunctionSource/,
  'Function-mode scripts must invoke the configured function and await its return value.',
);
assert.match(
  workerSource,
  /const hostCall = globalThis\.__lowCodeHostCall;[\s\S]*?const hostLog = globalThis\.__lowCodeHostLog;[\s\S]*?delete globalThis\.__lowCodeHostCall;[\s\S]*?delete globalThis\.__lowCodeHostLog;[\s\S]*?new AsyncFunction\("console"[\s\S]*?userScript\.call\(scriptThis, scriptConsole\)/,
  'User code must run in a separate function scope after raw host bridges are removed.',
);
assert.match(
  workerSource,
  /const scriptConsole = Object\.freeze\([\s\S]*?log:[\s\S]*?info:[\s\S]*?warn:[\s\S]*?error:[\s\S]*?type: 'log'/,
  'The isolated worker must forward bounded script console output without exposing its host bridge.',
);
assert.match(
  scriptsSource,
  /function writeLowCodeScriptLog[\s\S]*?data\.type === 'log'[\s\S]*?writeLowCodeScriptLog/,
  'Script console messages must be forwarded to the browser developer console.',
);
assert.match(
  scriptsSource,
  /import ScriptRuntimeWorker from '\.\/script-runtime\.worker\.ts\?worker&inline'[\s\S]*?new ScriptRuntimeWorker\([\s\S]*?worker\.terminate\(\)/,
  'Each untrusted execution must run in a disposable inline worker.',
);
assert.match(
  scriptsSource,
  /pendingCapabilities \+= 1;[\s\S]*?clearTimeout\(executionTimeoutId\)[\s\S]*?pendingCapabilities === 0[\s\S]*?scheduleExecutionTimeout\(\)/,
  'Waiting for an approved host capability must pause the script execution timeout.',
);
assert.match(
  scriptsSource,
  /preloadLowCodeScriptRuntime[\s\S]*?module-ready/,
  'The QuickJS worker module should preload before the first button click.',
);
assert.match(
  monacoTypesSource,
  /interface LowCodeButtonScriptThis[\s\S]*?executeAction[\s\S]*?executeHttp[\s\S]*?\$api:[\s\S]*?\$form:[\s\S]*?\$source:[\s\S]*?createButtonScriptWorker[\s\S]*?createButtonScriptMonacoModel/,
  'Monaco must know the capability-limited button script this API.',
);
assert.doesNotMatch(
  monacoTypesSource,
  /javascriptDefaults\.(?:addExtraLib|setCompilerOptions)/,
  'Button-script IntelliSense must not change the shared JavaScript language service.',
);
assert.match(
  buttonMaterialSource,
  /script: action\.script \?\? ''/,
  'Button events must carry their configured script.',
);
assert.match(
  converterSource,
  /const script = typeof row\.script === 'string'[\s\S]*?script\.trim\(\) \? \{ script \}/,
  'Visual conversion must persist button scripts.',
);
assert.match(
  rendererSource,
  /delete eventPayload\.script;[\s\S]*?delete eventPayload\.directives;/,
  'The script context must not expose executable script or directive source.',
);
assert.match(
  rendererSource,
  /scriptPolicy\?\.apiNames[\s\S]*?scriptPolicy\?\.capabilities[\s\S]*?!Array\.isArray\(allowedCapabilities\)[\s\S]*?allowedCapabilities\.includes\(request\.name\)/,
  'Page script policies must constrain registered APIs and host capabilities.',
);
for (const source of [schemaSource, apiSchemaSource]) {
  assert.match(
    source,
    /normalizeScriptPolicy\(value\.scriptPolicy\)[\s\S]*?scriptPolicy \? \{ scriptPolicy \}/,
    'Frontend and backend schema normalization must persist page script policies.',
  );
  assert.match(
    source,
    /knownScriptCapabilities[\s\S]*?validateScriptPolicy\(schema, issues\)/,
    'Frontend and backend schema validation must reject unknown script capabilities.',
  );
  assert.match(
    source,
    /normalizePageApis\(value\.apis\)[\s\S]*?validatePageApis\(schema, issues\)/,
    'Frontend and backend schema handling must persist and validate page API aliases.',
  );
  assert.match(
    source,
    /normalizePageFunctions\(value\.functions\)[\s\S]*?validatePageFunctions\(schema, issues\)/,
    'Frontend and backend schema handling must persist and validate page functions.',
  );
}
assert.match(
  rendererSource,
  /resolveLowCodeNodeAction\([\s\S]*?block\.kind[\s\S]*?props\.page\.node_actions[\s\S]*?executeDatabaseNodeAction\(action, block, options\)/,
  'executeAction must resolve the method attached by the API and run its database source.',
);
assert.match(
  rendererSource,
  /executeLowCodeScript\([\s\S]*?script: action\.source_code[\s\S]*?request\.name === 'node\.runtime'/,
  'Database action source must execute inside the existing isolated QuickJS runtime.',
);
assert.match(
  nodeActionRegistrySource,
  /actions[\s\S]*?action\.node_type === kind[\s\S]*?action\.action_code === method/,
  'The frontend registry must derive available methods exclusively from API action rows.',
);
assert.match(
  nodeActionMigration,
  /create table if not exists public\.lowcode_node_actions[\s\S]*?source_code text not null[\s\S]*?action_count <> 19 or node_type_count <> 5/,
  'The migration must own and validate every built-in node action.',
);
assert.doesNotMatch(
  rendererSource,
  /executeFormSetDataNodeAction|executeGridLoadDataNodeAction|action\.executor/,
  'Per-action TypeScript executors must not drift back into the page runtime.',
);
assert.match(
  rendererSource,
  /resolveScriptPageApi[\s\S]*?schema\.apis\?\.[\s\S]*?executeScriptHttp[\s\S]*?getServiceApi\(\)\.invoke/,
  'executeHttp must resolve a page API alias before invoking the host service API.',
);
assert.match(
  rendererSource,
  /resolvePageFunction[\s\S]*?schema\.functions\?\.find[\s\S]*?new PageFunctionExecutor\([\s\S]*?executePageFunction/,
  'executeFunction must resolve and run only an enabled function declared by the page schema.',
);
assert.match(
  rendererSource,
  /MAX_PAGE_FUNCTION_CALL_DEPTH = 16[\s\S]*?callStack\.length >= MAX_PAGE_FUNCTION_CALL_DEPTH[\s\S]*?callStack\.includes\(pageFunction\.name\)/,
  'Page functions must reject excessive call chains and direct or indirect recursion.',
);
assert.match(
  rendererSource,
  /hasSchemaPageFunctions\(\)[\s\S]*?'action\.execute'[\s\S]*?Object\.keys\(props\.page\.schema\.apis \?\? \{\}\)\.length > 0[\s\S]*?'http\.execute'/,
  'Page functions and declared API aliases must automatically expose their controlled capabilities.',
);
assert.match(
  rendererSource,
  /typeof options\.args !== 'undefined' && !isRecord\(options\.args\)[\s\S]*?executeFunction 参数 args 必须是对象/,
  'executeFunction must reject non-object args instead of silently discarding them.',
);
assert.match(
  rendererSource,
  /sanitizeScriptEventPayload[\s\S]*?delete payload\.script;[\s\S]*?delete payload\.directives;[\s\S]*?payload: this\.sanitizeScriptEventPayload\(request\.args\[1\]\)/,
  'Script-emitted events must not inject executable scripts or inline directives.',
);
assert.match(
  rendererInteractionsSource,
  /pendingActionEvents\.set\(action, execution\)[\s\S]*?await waitForActionEvent\(action\)/,
  'Built-in button behavior must wait for its directives and script to finish.',
);

clearLowCodeScriptApis();
const unregister = registerLowCodeScriptApi('record.approve', async (payload, context) => ({
  id: payload.id,
  pageCode: context.page.code,
}));
assert.deepEqual(getLowCodeScriptApiNames(), ['record.approve']);
assert.deepEqual(
  await invokeRegisteredLowCodeScriptApi(
    'record.approve',
    { id: 'r1' },
    {
      page: { code: 'records' },
      route: {},
      data: {},
      forms: {},
      searches: {},
      grids: {},
      event: {},
      policy: { apiNames: ['record.approve'] },
    },
  ),
  { id: 'r1', pageCode: 'records' },
);
await assert.rejects(
  invokeRegisteredLowCodeScriptApi(
    'record.approve',
    { id: 'r1' },
    {
      page: { code: 'records' },
      route: {},
      data: {},
      forms: {},
      searches: {},
      grids: {},
      event: {},
      policy: { apiNames: [] },
    },
  ),
  /未注册或当前用户无权调用/,
);
await assert.rejects(
  invokeRegisteredLowCodeScriptApi(
    'record.approve',
    { id: 'r1' },
    {
      page: { code: 'records' },
      route: {},
      data: {},
      forms: {},
      searches: {},
      grids: {},
      event: {},
    },
  ),
  /未注册或当前用户无权调用/,
  'Missing page policy must deny registered APIs by default.',
);

const bulkyContext = {
  page: { code: 'planning_console' },
  route: { path: '/dashboard/advanced/planning-console' },
  data: {
    operationPlans: Array.from({ length: 500 }, (_, index) => ({
      id: `plan-${index}`,
      reference: `auto-${index}`,
      payload: 'x'.repeat(1000),
    })),
  },
  forms: {
    planning_console_filter: { scenarioId: 'scenario-1' },
  },
  searches: {},
  grids: {},
  event: { name: 'buttonGroup.click', blockId: 'planning_console_actions' },
  policy: { apiNames: [] },
};
const compactedContext = compactLowCodeScriptContext(bulkyContext, 8 * 1024);
assert.ok(
  Buffer.byteLength(JSON.stringify(compactedContext), 'utf8') <= 8 * 1024,
  'Oversized page data must be compacted below the script payload budget.',
);
assert.deepEqual(
  compactedContext.forms.planning_console_filter,
  { scenarioId: 'scenario-1' },
  'Small form state should survive context compaction.',
);
assert.ok(
  Array.isArray(compactedContext.data.operationPlans) &&
    compactedContext.data.operationPlans.length < bulkyContext.data.operationPlans.length,
  'Large array data sources should be truncated instead of dropping the whole context.',
);
const unregisterAuthorized = registerLowCodeScriptApi('record.restricted', {
  authorize: (_payload, context) => context.page.role === 'admin',
  handler: () => ({ ok: true }),
});
await assert.rejects(
  invokeRegisteredLowCodeScriptApi('record.restricted', {}, {
    page: { role: 'guest' },
    route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {},
  }),
  /未注册或当前用户无权调用/,
);
unregisterAuthorized();
await assert.rejects(
  invokeRegisteredLowCodeScriptApi('missing.api', {}, {
    page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {},
  }),
  /未注册或当前用户无权调用/,
);
unregister();

const unregisterExecutor = registerLowCodeScriptExecutor(async (request, capability) => ({
  value: await capability({ id: 1, name: 'message.info', args: [request.script] }),
  apiCalls: 1,
  durationMs: 1,
}));
const executed = await executeLowCodeScript(
  {
    script: 'hello',
    context: {
      page: {}, route: {}, data: {}, forms: {}, searches: {}, grids: {}, event: {},
    },
  },
  (request) => request.args[0],
);
assert.equal(executed.value, 'hello');
unregisterExecutor();
clearLowCodeScriptApis();

console.log('Button script runtime regression test passed.');
