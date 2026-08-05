import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readWorkspaceFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const editorSource = await readWorkspaceFile(
  'packages/lowcode-framework/src/lowcode/form-materials/lc-json-editor/index.vue',
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
    path: 'frontend/schemas/lowcode.ts',
    pattern: /field: 'schemaJson'[\s\S]*?component: 'lc-json-editor'/,
    label: 'low-code page schema',
  },
  {
    path: 'packages/lowcode-framework/src/visual-editor/components/button-group-designer/button-group-designer.service.tsx',
    pattern: /field: 'directivesJson'[\s\S]*?component: 'lc-json-editor'/,
    label: 'button directive configuration',
  },
  {
    path: 'packages/tldraw-vue/src/components/LowCodeFormPanel.vue',
    pattern: /jsonField\('dataSourceHeaders'[\s\S]*?jsonField\('propsJson'/,
    label: 'print data headers and shape props',
  },
  {
    path: 'packages/lowcode-framework/src/visual-editor/components/right-attribute-panel/components/attr-editor/components/prop-config/index.tsx',
    pattern: /VisualEditorPropsType\.json\]: renderJsonInput[\s\S]*?<JsonDialogInput|<JsonDialogInput[\s\S]*?VisualEditorPropsType\.json\]: renderJsonInput/,
    label: 'visual component JSON props',
  },
  {
    path: 'packages/lowcode-framework/src/packages/chart-component/index.tsx',
    pattern: /categoriesJson: createEditorJsonProp[\s\S]*?optionJson: createEditorJsonProp/,
    label: 'chart JSON props',
  },
  {
    path: 'packages/lowcode-framework/src/packages/business-component/lowcode-grid/index.tsx',
    pattern: /postDataJson: createEditorJsonProp/,
    label: 'grid request JSON props',
  },
  {
    path: 'packages/lowcode-framework/src/packages/business-component/lowcode-edit-form/index.tsx',
    pattern: /postDataJson: createEditorJsonProp/,
    label: 'edit-form request JSON props',
  },
  {
    path: 'packages/approval-workflow/src/components/ApprovalDesigner.vue',
    pattern: /<JsonDialogInput[\s\S]*?label="配置 JSON"[\s\S]*?standalone[\s\S]*?root-type="object"/,
    label: 'approval node configuration',
  },
  {
    path: 'packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue',
    pattern: /<JsonDialogInput[\s\S]*?label="Compiled plan"[\s\S]*?standalone[\s\S]*?<JsonDialogInput[\s\S]*?label="Raw config"[\s\S]*?standalone/,
    label: 'trigger compiled plan and raw configuration',
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
  const source = await readWorkspaceFile(entry.path);
  assert.match(
    source,
    entry.pattern,
    `The ${entry.label} must use the shared single-line JSON dialog control.`,
  );
}

const retainedTextareaEntries = [
  ['frontend/schemas/lowcode.ts', /field: 'description'[\s\S]*?component: 'vxe-textarea'/],
  [
    'packages/trigger-workflow-editor/src/components/TriggerWorkflowEditor.vue',
    /<span>System prompt<\/span><textarea/,
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
