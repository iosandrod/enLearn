import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clearLowCodeScriptApis,
  getLowCodeScriptApiNames,
  invokeRegisteredLowCodeScriptApi,
  registerLowCodeScriptApi,
  registerLowCodeScriptExecutor,
  executeLowCodeScript,
} from '../../packages/lowcode-framework/src/runtime/scripts.ts';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [rendererSource, workerSource, scriptsSource, buttonMaterialSource, converterSource, monacoTypesSource, schemaSource, apiSchemaSource] =
  await Promise.all([
    readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/script-runtime.worker.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/scripts.ts', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/button-group/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/visual-converters/lowcode-button-group/index.ts', frameworkRoot), 'utf8'),
    readFile(new URL('visual-editor/components/button-group-designer/button-script-monaco.ts', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/schema.ts', frameworkRoot), 'utf8'),
    readFile(new URL('../../api/src/lowcode-service/lowcode.schema.ts', import.meta.url), 'utf8'),
  ]);

assert.match(
  rendererSource,
  /executeLowCodeScript\([\s\S]*?handleScriptCapability/,
  'Published button scripts must execute through the registered safe script runtime.',
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
  /const hostCall = globalThis\.__lowCodeHostCall;[\s\S]*?delete globalThis\.__lowCodeHostCall;[\s\S]*?new AsyncFunction\([\s\S]*?userScript\.call\(scriptThis\)/,
  'User code must run in a separate function scope after the raw host bridge is removed.',
);
assert.match(
  scriptsSource,
  /new Worker\([\s\S]*?new URL\('\.\/script-runtime\.worker\.ts', import\.meta\.url\)[\s\S]*?worker\.terminate\(\)/,
  'Each untrusted execution must run in a disposable worker.',
);
assert.match(
  scriptsSource,
  /preloadLowCodeScriptRuntime[\s\S]*?module-ready/,
  'The QuickJS worker module should preload before the first button click.',
);
assert.match(
  monacoTypesSource,
  /interface LowCodeButtonScriptThis[\s\S]*?\$api:[\s\S]*?\$form:[\s\S]*?\$source:[\s\S]*?createButtonScriptWorker[\s\S]*?createButtonScriptMonacoModel/,
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
  /scriptPolicy\?\.apiNames[\s\S]*?scriptPolicy\?\.capabilities[\s\S]*?allowedCapabilities\.includes\(request\.name\)/,
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
}
assert.match(
  rendererSource,
  /function sanitizeScriptEventPayload[\s\S]*?delete payload\.script;[\s\S]*?delete payload\.directives;[\s\S]*?payload: sanitizeScriptEventPayload\(args\[1\]\)/,
  'Script-emitted events must not inject executable scripts or inline directives.',
);
assert.match(
  rendererSource,
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
