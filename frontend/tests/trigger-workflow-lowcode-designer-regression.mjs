import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../../supabase/migrations/20260905110000_trigger_workflow_lowcode_designer.sql', import.meta.url),
  'utf8',
);
const editor = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue', import.meta.url),
  'utf8',
);
const route = await readFile(new URL('../src/router.ts', import.meta.url), 'utf8');
const page = await readFile(
  new URL('../pages/dashboard/trigger-workflow/lowcode-designer.vue', import.meta.url),
  'utf8',
);
const controller = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/material-controller-registry.ts', import.meta.url),
  'utf8',
);

assert.match(migration, /'trigger-workflow-designer', '触发器编排画布'/);
assert.match(migration, /"kind": "buttonGroup"/);
assert.match(migration, /"kind": "trigger-workflow-designer"/);
assert.match(migration, /"layout": \{ "fillRemaining": true \}/);
assert.match(migration, /loadLowCodeFormDefinition\(api, code\)/);
assert.match(migration, /loadLowCodeFormDefinition\(api, 'trigger-workflow\.edge'\)/);
assert.match(migration, /:minimal="true"/);
assert.match(migration, /node_type, node_label[\s\S]*'triggerWorkflowDesigner'/);

assert.match(editor, /minimal\?: boolean/);
assert.match(editor, /v-if="!minimal" class="trigger-editor__header"/);
assert.match(editor, /<aside class="trigger-editor__palette">/);
assert.match(editor, /<template v-if="!minimal">[\s\S]*流程模板[\s\S]*<\/template>/);
assert.match(editor, /\.trigger-editor--minimal \.trigger-editor__workspace \{\s*grid-template-columns: 196px minmax\(0, 1fr\);/);
assert.match(editor, /v-if="!minimal" class="trigger-editor__inspector"/);
assert.match(editor, /if \(props\.minimal\) void openSelectedInspectorDialog\(\)/);
assert.match(editor, /openGlobalDialog\(\{[\s\S]*form: \{[\s\S]*schema,[\s\S]*onUpdateModel/);
assert.match(editor, /buildJob: \(\) => buildTriggerWorkflowJob\(currentModel\.value\)/);

assert.match(route, /trigger-workflow\/designer'[\s\S]*trigger-workflow\/lowcode-designer\.vue/);
assert.match(page, /getLowCodePage\(serviceApi,[\s\S]*route: '\/dashboard\/trigger-workflow\/designer'/);
for (const method of ['compile', 'enable', 'run', 'refresh', 'loadTemplate']) {
  assert.match(controller, new RegExp(`${method}\\?:`));
}

console.log('Trigger workflow low-code designer regression passed.');
