import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(
  new URL('../pages/dashboard/trigger-workflow/designer.vue', import.meta.url),
  'utf8',
);
const editorSource = await readFile(
  new URL(
    '../../packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue',
    import.meta.url,
  ),
  'utf8',
);
const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260813140000_trigger_workflow_model_picker.sql',
    import.meta.url,
  ),
  'utf8',
);
const browserTestSource = await readFile(
  new URL('./trigger-workflow-persistence-browser-launcher.mjs', import.meta.url),
  'utf8',
);

for (const [eventName, label, icon] of [
  ['new-workflow', '新建流程', 'ri-file-add-line'],
  ['save-workflow', '保存流程', 'ri-save-3-line'],
  ['load-workflow', '加载流程', 'ri-folder-open-line'],
]) {
  assert.match(editorSource, new RegExp(`emit\\('${eventName}'\\)`));
  assert.ok(editorSource.includes(label), `The header must show the ${label} action.`);
  assert.ok(editorSource.includes(icon), `The ${label} action must use its expected icon.`);
  assert.match(pageSource, new RegExp(`@${eventName}="[^"]+"`));
}

assert.match(
  pageSource,
  /const triggerWorkflowDocumentType = 'trigger-workflow'[\s\S]*async function saveWorkflow[\s\S]*savedModelId\.value \? 'updateModel' : 'saveModel'[\s\S]*documentType: triggerWorkflowDocumentType[\s\S]*schema: model\.value/,
  'Save must create a new workflow model and update a previously loaded model.',
);
assert.match(
  pageSource,
  /model\.value = \{ \.\.\.model\.value, id: saved\.id \}[\s\S]*persistLocalWorkflow\(model\.value\)/,
  'A saved model ID must be retained locally so later saves update the same record.',
);
assert.match(
  pageSource,
  /confirmLowCodePage\(\{[\s\S]*pageCode: workflowModelListPageCode[\s\S]*includeData: true[\s\S]*requireSelection: true/,
  'Load must use the shared low-code confirmation dialog with a required row selection.',
);
assert.match(
  pageSource,
  /workflowApi<WorkflowModelRecord>\('getModel',[\s\S]*modelId: selected\.id[\s\S]*saved\.documentType !== triggerWorkflowDocumentType[\s\S]*readWorkflowSchema\(saved\.draftSchema\)/,
  'Load must fetch and apply the selected workflow draft schema.',
);
assert.match(
  pageSource,
  /function createBlankWorkflowModel[\s\S]*type: 'start'[\s\S]*type: 'end'[\s\S]*edge_start_end/,
  'A new workflow must start with a valid start-to-end scaffold.',
);

const schemaMatch = migrationSource.match(/\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
assert.ok(schemaMatch, 'The Trigger workflow picker migration must embed a low-code page schema.');
const pickerSchema = JSON.parse(schemaMatch[1]);
assert.equal(pickerSchema.code, 'trigger-workflow-models');
assert.deepEqual(
  pickerSchema.dataSources.triggerWorkflowModels.postData,
  {
    itemType: 'models',
    filters: { documentType: 'trigger-workflow' },
    limit: 200,
  },
  'The picker must list only Trigger workflow models.',
);
const pickerGrid = pickerSchema.blocks.find((block) => block.kind === 'grid');
assert.equal(pickerGrid?.schema.grid.rowConfig.isCurrent, true);
assert.ok(
  Object.hasOwn(pickerGrid?.schema.events ?? {}, 'rowCurrentChange'),
  'The picker grid must publish current-row selection events for the shared dialog.',
);
assert.match(
  browserTestSource,
  /saveModel[\s\S]*updateModel[\s\S]*lowcode-reference-dialog[\s\S]*getModel/,
  'The authenticated browser test must cover create, update, low-code selection, and load.',
);
assert.match(
  browserTestSource,
  /deleteItem[\s\S]*resource: 'wf_model'/,
  'The authenticated browser test must remove the workflow record it creates.',
);

console.log('Trigger workflow persistence regression test passed.');
