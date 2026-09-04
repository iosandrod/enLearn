import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const readWorkspaceFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const editorSource = await readLowCodeMaterialSource('form', 'lc-json-editor');
const formDefinitionMigration = await readWorkspaceFile(
  'supabase/migrations/20260808200000_lowcode_form_definitions.sql',
);

assert.match(
  editorSource,
  /<vxe-input[\s\S]*?:model-value="previewValue"[\s\S]*?:editable="false"/,
  'The JSON material must use a single-line input as its form preview.',
);
assert.match(
  editorSource,
  /class="lc-json-editor__trigger"[\s\S]*?@click\.stop="openEditor"[\s\S]*?ri-braces-line/,
  'The input suffix must expose an accessible JSON editor trigger.',
);
assert.match(
  editorSource,
  /openGlobalDialog\(\{[\s\S]*?body: renderEditor[\s\S]*?onConfirm:/,
  'JSON editing must be hosted by the shared global dialog service.',
);
assert.match(
  editorSource,
  /h\(VxeTextarea as any,[\s\S]*?'onUpdate:modelValue'/,
  'The global dialog must provide a multiline JSON editing surface.',
);
assert.match(
  editorSource,
  /JSON\.parse\(value\)[\s\S]*?'message' in parsed[\s\S]*?return false;/,
  'Invalid JSON must keep the dialog open instead of updating the form value.',
);
assert.match(
  editorSource,
  /jsonRootType[\s\S]*?JSON 顶层必须是对象[\s\S]*?JSON 顶层必须是数组/,
  'JSON fields must be able to constrain the root value to an object or array.',
);
assert.match(
  editorSource,
  /jsonValueMode[\s\S]*?resolveCommittedValue/,
  'JSON fields must preserve the value contract expected by each caller.',
);

const structuredJsonEntries = [
  {
    source: formDefinitionMigration,
    path: 'supabase/migrations/20260808200000_lowcode_form_definitions.sql',
    pattern: /"field": "schemaJson"[\s\S]*?"component": "lc-json-editor"/,
    label: 'low-code page schema',
  },
  {
    path: 'supabase/migrations/20260831170000_button_group_designer_form_schema.sql',
    pattern: /"field": "directivesJson"[\s\S]*?"component": "lc-json-editor"/,
    label: 'button directive configuration',
  },
  {
    path: 'packages/tldraw-vue/src/components/LowCodeFormPanel.vue',
    pattern: /jsonField\('dataSourceHeaders'[\s\S]*?jsonField\('propsJson'/,
    label: 'print data headers and shape props',
  },
  {
    path: 'packages/lowcode-framework/src/visual-editor/material-prop-forms/helpers.ts',
    pattern: /export function jsonPropField[\s\S]*?component: 'lc-json-editor'[\s\S]*?valueKind: 'json'/,
    label: 'visual component JSON props',
  },
  {
    path: 'supabase/migrations/20260819100000_database_only_material_property_forms.sql',
    pattern: /'field', 'categoriesJson'[\s\S]*?'component', 'lc-json-editor'[\s\S]*?'field', 'seriesDataJson'[\s\S]*?'component', 'lc-json-editor'[\s\S]*?'field', 'pieDataJson'[\s\S]*?'component', 'lc-json-editor'[\s\S]*?'field', 'radarIndicatorsJson'[\s\S]*?'component', 'lc-json-editor'[\s\S]*?'field', 'radarDataJson'[\s\S]*?'component', 'lc-json-editor'[\s\S]*?'field', 'optionJson'[\s\S]*?'component', 'lc-json-editor'/,
    label: 'chart JSON props',
  },
  {
    path: 'supabase/migrations/20260819100000_database_only_material_property_forms.sql',
    pattern: /"componentKey":"lowcode-grid"[\s\S]*?"field":"postDataJson"[\s\S]*?"component":"lc-json-editor"/,
    label: 'grid request JSON props',
  },
  {
    path: 'supabase/migrations/20260819100000_database_only_material_property_forms.sql',
    pattern: /"componentKey":"lowcode-edit-form"[\s\S]*?"field":"postDataJson"[\s\S]*?"component":"lc-json-editor"/,
    label: 'edit-form request JSON props',
  },
  {
    path: 'packages/approval-workflow/src/components/ApprovalDesigner.vue',
    pattern: /<JsonDialogInput[\s\S]*?label="配置 JSON"[\s\S]*?standalone[\s\S]*?root-type="object"/,
    label: 'approval node configuration',
  },
  {
    path: 'packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue',
    pattern: /<JsonDialogInput[\s\S]*?label="编译结果"[\s\S]*?standalone[\s\S]*?value-mode="string"/,
    label: 'trigger compiled plan',
  },
  {
    path: 'packages/trigger-workflow-editor/src/inspector-form.ts',
    pattern: /jsonField\('rawConfig'[\s\S]*?component: 'lc-json-editor'[\s\S]*?jsonRootType: rootType[\s\S]*?jsonValueMode: 'parsed'/,
    label: 'trigger raw configuration',
  },
  {
    path: 'frontend/pages/dashboard/workflow/designer.vue',
    pattern: /<JsonDialogInput[\s\S]*?label="Workflow Schema JSON"[\s\S]*?root-type="object"/,
    label: 'workflow schema',
  },
  {
    path: 'mobile-app/src/runtime/materials/mobile-form-field.vue',
    pattern: /kind === 'json'[\s\S]*?json-preview[\s\S]*?json-edit-button[\s\S]*?json-dialog-editor/,
    label: 'mobile JSON form field',
  },
];

for (const entry of structuredJsonEntries) {
  const source = entry.source ?? await readWorkspaceFile(entry.path);
  assert.match(
    source,
    entry.pattern,
    `The ${entry.label} must use the shared single-line JSON dialog control.`,
  );
}

const retainedTextareaEntries = [
  [
    'supabase/migrations/20260808200000_lowcode_form_definitions.sql',
    /"field": "description"[\s\S]*?"component": "vxe-textarea"/,
  ],
  [
    'packages/trigger-workflow-editor/src/inspector-form.ts',
    /textareaField\('aiPrompt', '系统提示词'/,
  ],
  [
    'packages/tldraw-vue/src/components/LowCodeFormPanel.vue',
    /textareaField\('dataSourceBody', '请求体 JSON\/文本'\)/,
  ],
];

for (const [path, pattern] of retainedTextareaEntries) {
  assert.match(
    await readWorkspaceFile(path),
    pattern,
    `True multiline text in ${path} must remain a textarea.`,
  );
}

console.log('Low-code JSON editor dialog regression test passed.');
