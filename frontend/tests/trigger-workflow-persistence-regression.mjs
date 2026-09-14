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
    '../../artifacts/migration-backups/migrations-20260907-174149/supabase-migrations/20260813140000_trigger_workflow_model_picker.sql',
    import.meta.url,
  ),
  'utf8',
);
const pageScriptRuntimeSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts',
    import.meta.url,
  ),
  'utf8',
);
const saveDialogMigrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260910050000_trigger_workflow_save_dialog.sql',
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
  /const triggerWorkflowDocumentType = 'trigger-workflow'[\s\S]*async function saveWorkflow[\s\S]*confirmLowCodePage\(\{[\s\S]*pageCode: 'workflow-model-management-edit'[\s\S]*submitOnConfirm: true[\s\S]*disableFormAutoLoad: true[\s\S]*draftSchema: schema/,
  'Save must open the workflow model edit page for both new and existing workflows.',
);
assert.match(
  pageSource,
  /disableFormAutoLoad: true,[\s\S]*\.\.\.\(schema\.id \? \{ filters: \{ id: schema\.id \} \} : \{\}\),/,
  'Save must pass the current workflow ID as the edit form filter instead of relying on the dialog route query.',
);
assert.match(
  pageScriptRuntimeSource,
  /'formInitialValues',[\s\S]*'filters',[\s\S]*'disableFormAutoLoad'/,
  'Script-driven low-code dialogs must preserve the filters option when sanitizing their configuration.',
);
assert.match(
  pageSource,
  /savedModelId\.value = savedId[\s\S]*model\.value = \{ \.\.\.savedSchema, id: savedId \}[\s\S]*persistLocalWorkflow\(model\.value\)/,
  'A saved model ID must be retained locally so later saves update the same record.',
);
assert.match(
  pageSource,
  /savedSchema\.nodes\.length !== schema\.nodes\.length[\s\S]*savedSchema\.edges\.length !== schema\.edges\.length[\s\S]*节点或连线不完整/,
  'The page must not replace the live canvas with a truncated save response.',
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

const saveDialogSchemaMatch = saveDialogMigrationSource.match(
  /\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/,
);
assert.ok(saveDialogSchemaMatch, 'The workflow model edit migration must embed a page schema.');
const saveDialogSchema = JSON.parse(saveDialogSchemaMatch[1]);
assert.deepEqual(
  {
    serviceName: saveDialogSchema.dataSources['edit-form'].serviceName,
    saveMethod: saveDialogSchema.dataSources['edit-form'].saveMethod,
    sourceKey: saveDialogSchema.blocks[0].sourceKey,
    submitSourceKey: saveDialogSchema.blocks[0].submitSourceKey,
  },
  {
    serviceName: 'workflow',
    saveMethod: 'saveItem',
    sourceKey: 'edit-form',
    submitSourceKey: 'edit-form',
  },
  'The save dialog must use the workflow service so schema validation and field mapping cannot be bypassed.',
);
const draftSchemaField = saveDialogSchema.blocks[0].schema.fields.find(
  (field) => field.field === 'draftSchema',
);
const codeField = saveDialogSchema.blocks[0].schema.fields.find(
  (field) => field.field === 'code',
);
assert.equal(
  codeField?.validationScript,
  undefined,
  'Workflow code validation must not depend on a field-validation event payload that is unavailable at submit time.',
);
assert.deepEqual(
  {
    component: draftSchemaField?.component,
    rootType: draftSchemaField?.props?.jsonRootType,
    valueMode: draftSchemaField?.props?.jsonValueMode,
  },
  { component: 'lc-json-editor', rootType: 'object', valueMode: 'parsed' },
  'draftSchema must remain an object-valued form field during submission.',
);

for (const expected of [
  'pageCode: "workflow-model-management-edit"',
  'submitOnConfirm: true',
  'disableFormAutoLoad: true',
  'formInitialValues:',
  'draftSchema: schema',
  'schema.id || ""',
  'method: "setData"',
]) {
  assert.ok(
    saveDialogMigrationSource.includes(expected),
    `The Trigger workflow save dialog migration must include ${expected}.`,
  );
}
assert.match(
  saveDialogMigrationSource,
  /const validation = await this\.executeAction[\s\S]*method: "validate"[\s\S]*const schema = await this\.executeAction[\s\S]*method: "getData"/,
  'Save must validate and read the current canvas before opening the model editor.',
);
assert.match(
  saveDialogMigrationSource,
  /savedSchema\.nodes\.length !== schema\.nodes\.length[\s\S]*savedSchema\.edges\.length !== schema\.edges\.length[\s\S]*节点或连线不完整/,
  'The low-code save action must reject a truncated persistence response before replacing the canvas.',
);
assert.match(
  saveDialogMigrationSource,
  /"field": "draftSchema"[\s\S]*"component": "lc-json-editor"/,
  'The edit form must retain the workflow draft schema in its submission model.',
);
assert.match(
  saveDialogMigrationSource,
  /"field": "name"[\s\S]*"updateScript":[^\n]*draftSchema[\s\S]*"field": "code"[\s\S]*"updateScript":[^\n]*draftSchema/,
  'Editing workflow identity fields must keep the submitted draft schema in sync.',
);

console.log('Trigger workflow persistence regression test passed.');
