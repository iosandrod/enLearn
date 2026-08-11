import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('runtime/row-action-state.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const rowActionRuntime = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const { isLowCodeRowActionDisabled, visibleLowCodeRowActions } = rowActionRuntime;

const operationActions = [
  { code: 'start', visible: { field: 'status', operator: 'eq', value: 'ready' } },
  { code: 'pause', visible: { field: 'status', operator: 'eq', value: 'in_progress' } },
  { code: 'resume', visible: { field: 'status', operator: 'eq', value: 'paused' } },
];
assert.deepEqual(
  visibleLowCodeRowActions(operationActions, { status: 'in_progress' }).map((action) => action.code),
  ['pause'],
);
assert.equal(
  isLowCodeRowActionDisabled(
    { disabled: { field: 'row_version', operator: 'lt', value: 3 } },
    { row_version: 2 },
  ),
  true,
);

const [dialogHost, renderer, mesPages, forwardMigration] = await Promise.all([
  readFile(new URL('components/GlobalDialogHost.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260811190000_mes_lowcode_pages.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260812110000_mes_runtime_action_guards.sql', import.meta.url), 'utf8'),
]);

assert.match(
  dialogHost,
  /if \(!\(await validateDialogForms\(instance\.id\)\)\) return;[\s\S]*?instance\.config\.onConfirm/,
  'Dialog confirmation must validate rendered forms before invoking commands.',
);
assert.match(
  dialogHost,
  /catch \(error\) \{[\s\S]*?instance\.errorMessage = error instanceof Error/,
  'A failed dialog command must leave the dialog mounted and expose the error.',
);
assert.match(dialogHost, /lc-global-dialog__error[\s\S]*?role="alert"/);
assert.match(
  renderer,
  /onConfirm: async \(context\)[\s\S]*?await publishRuntimeEvent\(createFollowUpEvent\([\s\S]*?'confirm'/,
  'Confirm directives must finish successfully before the dialog can close.',
);
assert.match(
  renderer,
  /catch \(error\) \{[\s\S]*?reportRuntimeDirectiveError\(error\);[\s\S]*?if \(event\.payload\?\.action === 'confirm'\) throw error;/,
  'A failed dialog confirmation directive must reject so the dialog remains open.',
);
assert.match(mesPages, /"code": "start"[\s\S]*?"visible": \{ "field": "status", "operator": "eq", "value": "ready" \}/);
assert.match(mesPages, /"code": "pause"[\s\S]*?"visible": \{ "field": "status", "operator": "eq", "value": "in_progress" \}/);
assert.match(mesPages, /"code": "return"[\s\S]*?"field": "available_to_return", "operator": "gt", "value": 0/);
assert.match(mesPages, /"code": "reverse-production"[\s\S]*?"field": "reversible"/);
assert.match(forwardMigration, /page\.code = 'mes_execution_console'/);
assert.match(forwardMigration, /work_order\.status not in \('closed', 'canceled'\)\) as reversible/);

console.log('MES low-code runtime safety regression test passed.');
