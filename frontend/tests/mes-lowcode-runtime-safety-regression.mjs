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

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
});
const mesCommandBundle = await build({
  entryPoints: [fileURLToPath(new URL('runtime/mes-command.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const mesCommandRuntime = await import(
  `data:text/javascript;base64,${Buffer.from(mesCommandBundle.outputFiles[0].text).toString('base64')}`
);
const {
  invokeDesktopMesCommand,
  isDesktopMesCommand,
  prepareDesktopMesCommandRequest,
} = mesCommandRuntime;

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

const [dialogHost, renderer, grid, pageRuntime, mesPages, forwardMigration] = await Promise.all([
  readFile(new URL('components/GlobalDialogHost.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('components/LowCodeGrid.vue', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/page-runtime.ts', frameworkRoot), 'utf8'),
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
assert.match(
  renderer,
  /isDesktopMesCommand\([\s\S]*?prepareDesktopMesCommandRequest\([\s\S]*?invokeDesktopMesCommand\([\s\S]*?requestId: commandRequest\.requestId/,
  'Desktop MES commands must carry a stable command envelope through retries.',
);
assert.match(
  renderer,
  /if \(options\.ordered\) \{[\s\S]*?for \(const entry of entries\)[\s\S]*?Promise\.all\(entries\.map\(refreshEntry\)\)/,
  'MES refreshes must be ordered without serializing ordinary page refreshes.',
);
assert.match(
  renderer,
  /ordered: refreshAfterMesCommand,[\s\S]*?strict: refreshAfterMesCommand,[\s\S]*?mesCommandRefreshCompleted = true/,
  'A desktop MES command must retain its lock through a strict data-source refresh.',
);
assert.match(
  renderer,
  /mesCommandRefreshFailed: boolean[\s\S]*?mesCommandRefreshFailed: false/,
  'Desktop MES directive execution must track a failed projection refresh.',
);
assert.match(
  renderer,
  /catch \(error\) \{[\s\S]*?if \(refreshAfterMesCommand\) executionContext\.mesCommandRefreshFailed = true;[\s\S]*?throw error;/,
  'A failed strict MES refresh must suppress later success directives in the same chain.',
);
assert.match(
  renderer,
  /runtime\.state\.status\.mesCommandExecuting = true/,
  'Desktop MES command execution must expose a page-wide lock and always release it.',
);
assert.match(
  renderer,
  /finally \{[\s\S]*?if \(executionContext\.mesCommandStarted\)[\s\S]*?mesCommandExecuting = false/,
  'Desktop MES command execution must release its page-wide lock in a finally block.',
);
assert.match(pageRuntime, /mesCommandExecuting: boolean[\s\S]*?mesCommandActionKey: string/);
assert.match(grid, /readonly \|\| executing \|\| isRowActionDisabled/);
assert.match(
  dialogHost,
  /if \(instance\.busyAction \|\| readValue\(action\.disabled, false\)\) return;/,
  'Dialog actions must suppress duplicate confirmation while a command is pending.',
);
assert.match(
  dialogHost,
  /assignRecord\(formModel, value, true\);[\s\S]*?if \(formModel !== instance\.model\) context\.setModel\(value\)/,
  'A configured dialog form model must remain synchronized with confirmation values.',
);
assert.match(mesPages, /"code": "start"[\s\S]*?"visible": \{ "field": "status", "operator": "eq", "value": "ready" \}/);
assert.match(mesPages, /"code": "pause"[\s\S]*?"visible": \{ "field": "status", "operator": "eq", "value": "in_progress" \}/);
assert.match(mesPages, /"code": "return"[\s\S]*?"field": "available_to_return", "operator": "gt", "value": 0/);
assert.match(mesPages, /"code": "reverse-production"[\s\S]*?"field": "reversible"/);
assert.match(forwardMigration, /page\.code = 'mes_execution_console'/);
assert.match(forwardMigration, /work_order\.status not in \('closed', 'canceled'\)\) as reversible/);

assert.equal(isDesktopMesCommand('mes', 'startOperation'), true);
assert.equal(isDesktopMesCommand('planning', 'startOperation'), false);
const [firstCommand, secondCommand] = await Promise.all([
  prepareDesktopMesCommandRequest({ operationId: 'operation-1' }),
  prepareDesktopMesCommandRequest({ operationId: 'operation-2' }),
]);
assert.equal(firstCommand.postData.commandId, firstCommand.requestId);
assert.equal(secondCommand.postData.commandId, secondCommand.requestId);
assert.equal(firstCommand.postData.deviceId, secondCommand.postData.deviceId);
assert.notEqual(firstCommand.postData.localSequence, secondCommand.postData.localSequence);
assert.ok(Number.isSafeInteger(firstCommand.postData.localSequence));
assert.ok(Number.isSafeInteger(secondCommand.postData.localSequence));

const replayRequest = await prepareDesktopMesCommandRequest({ operationId: 'operation-3' });
let transientAttempts = 0;
const replayedIds = [];
const replayResult = await invokeDesktopMesCommand(async () => {
  transientAttempts += 1;
  replayedIds.push(replayRequest.requestId);
  if (transientAttempts === 1) {
    throw Object.assign(new Error('socket hang up'), { status: 503 });
  }
  return { ok: true };
}, 0);
assert.deepEqual(replayResult, { ok: true });
assert.deepEqual(replayedIds, [replayRequest.requestId, replayRequest.requestId]);

let conflictAttempts = 0;
await assert.rejects(
  invokeDesktopMesCommand(async () => {
    conflictAttempts += 1;
    throw Object.assign(new Error('row version conflict'), { status: 409 });
  }, 0),
  /row version conflict/,
);
assert.equal(conflictAttempts, 1, 'MES optimistic-lock conflicts must not be retried.');
await assert.rejects(
  prepareDesktopMesCommandRequest({ deviceId: 'scanner-without-sequence' }),
  /must be supplied together/,
);

console.log('MES low-code runtime safety regression test passed.');
