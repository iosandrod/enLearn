import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  materialSource,
  materialEntrySource,
  arrayTableSource,
  designerSource,
  buttonSchemaMigrationSource,
  formDesignerSource,
  attrEditorSource,
  formFieldSource,
  formSource,
  searchFormSource,
  converterHelpersSource,
  runtimeFormDesignerSource,
  runtimeFormFieldEditorSource,
  pageRendererRuntimeSource,
  componentTypeMigrationSource,
  onChangeMigrationSource,
] = await Promise.all([
  readLowCodeMaterialSource('form', 'lc-monaco-editor'),
  readFile(
    new URL('lowcode/material-runtime/material-adapters.ts', frameworkRoot),
    'utf8',
  ),
  readLowCodeMaterialSource('form', 'lc-array-table'),
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(
    new URL('../../../supabase/migrations/20260831170000_button_group_designer_form_schema.sql', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL(
      'visual-editor/components/form-designer/form-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(
    new URL(
      'visual-editor/components/right-attribute-panel/components/attr-editor/index.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
  readFile(new URL('components/LowCodeFormField.vue', frameworkRoot), 'utf8'),
  readLowCodeMaterialSource('page', 'form'),
  readLowCodeMaterialSource('page', 'searchForm'),
  readFile(new URL('lowcode/visual-converters/helpers.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-field-editor.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/useLowCodePageRenderer.ts', frameworkRoot), 'utf8'),
  readFile(
    new URL('../../../supabase/migrations/20260826090000_form_input_monaco_component_type.sql', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL('../../../supabase/migrations/20260826110000_form_input_on_change_property.sql', frameworkRoot),
    'utf8',
  ),
]);

assert.match(
  materialEntrySource,
  /\['lc-monaco-editor',\s*'代码编辑器'/,
  'The Monaco editor metadata must be registered as a reusable low-code form material.',
);
assert.match(
  materialSource,
  /<vxe-input[\s\S]*?class="lc-monaco-editor__trigger"[\s\S]*?@click\.stop="openEditorDialog"/,
  'Dialog mode must render a normal input with an editor trigger icon.',
);
assert.match(
  materialSource,
  /component: 'lc-monaco-editor'[\s\S]*?openGlobalDialog<\{ code: string \}>\([\s\S]*?form: \{[\s\S]*?schema/,
  'The trigger must open a global dialog containing a low-code form and an inline Monaco field.',
);
assert.match(
  materialSource,
  /language: language\.value[\s\S]*?Monaco\.editor\.createModel\([\s\S]*?Monaco\.editor\.create\(/,
  'The inline form material must create a Monaco editor with a configurable language.',
);
assert.match(
  materialSource,
  /createButtonScriptMonacoModel\([\s\S]*?editorModel\?\.dispose\(\)/,
  'Button scripts must use an isolated typed model and dispose it with the editor.',
);
assert.match(
  materialSource,
  /resolveEditorDialogLayout\(\)[\s\S]*?availableRight = viewportWidth - drawerWidth - SCRIPT_DIALOG_DRAWER_GAP[\s\S]*?position: \{[\s\S]*?left: Math\.round\(left\)/,
  'Script dialogs must reserve room for the context drawer and open in the remaining left-side area.',
);
assert.match(
  arrayTableSource,
  /<component[\s\S]*?column\.component === 'lc-monaco-editor'[\s\S]*?:is="monacoEditorComponent"[\s\S]*?setCell/,
  'Array-table columns must support the Monaco form material.',
);
assert.match(
  buttonSchemaMigrationSource,
  /["']field["']:\s*["']script["'][\s\S]*?["']title["']:\s*["'](?:执行脚本|鎵ц鑴氭湰)["'][\s\S]*?["']component["']:\s*["']lc-monaco-editor["'][\s\S]*?["']dialog["']:\s*true[\s\S]*?["']language["']:\s*["']javascript["'][\s\S]*?["']scriptThisType["']:\s*["']LowCodeButtonScriptThis["']/,
  'The button designer must expose a JavaScript execution-script column in dialog mode.',
);
assert.match(
  attrEditorSource,
  /nextRuntimeComponent === 'lc-monaco-editor'[\s\S]*?defaultCodeEditorProps[\s\S]*?dialog: block\.props\.dialog !== false[\s\S]*?language: readString\(block\.props\.language\) \|\| defaultCodeEditorProps\.language/,
  'Selecting the form code input must configure the same dialog-based Monaco editor as table scripts.',
);
assert.match(
  formDesignerSource,
  /runtimeComponent === 'lc-monaco-editor'[\s\S]*?normalizeCodeEditorProps\(field\.props\)[\s\S]*?block\.props\.__lowcodeComponent = 'lc-monaco-editor'/,
  'Form designer blocks must retain the Monaco runtime override and dialog props.',
);
assert.match(
  formDesignerSource,
  /runtimeComponent === 'lc-monaco-editor'[\s\S]*?result\.props = normalizeCodeEditorProps\(block\.props\)/,
  'Form designer round trips must persist the Monaco dialog configuration into the form schema.',
);
assert.match(
  formFieldSource,
  /props\.field\.component === 'lc-monaco-editor'[\s\S]*?fieldProps\.dialog = fieldProps\.dialog !== false[\s\S]*?fieldProps\.language \|\|= 'javascript'/,
  'Runtime form fields must default Monaco code inputs to the dialog editor mode.',
);
assert.match(
  formFieldSource,
  /delete fieldProps\.onChange/,
  'Code stored in props.onChange must remain a low-code script instead of being passed as a component callback prop.',
);
assert.match(
  formSource,
  /onChangeScript[\s\S]*?const script = onChangeScript \|\| payload\.field\.updateScript \|\| ''[\s\S]*?script,/,
  'Form field changes must publish a configured props.onChange script.',
);
assert.match(
  searchFormSource,
  /onChangeScript[\s\S]*?const script = onChangeScript \|\| payload\.field\.updateScript \|\| ''[\s\S]*?script,/,
  'Search-form field changes must publish a configured props.onChange script.',
);
assert.match(
  converterHelpersSource,
  /const onChange = readString\(rawProps\.onChange\)[\s\S]*?delete rawProps\.onChange[\s\S]*?const updateScript = readString\(row\.updateScript, onChange\)/,
  'Legacy props.onChange values must normalize to the runtime updateScript field.',
);
assert.match(
  runtimeFormDesignerSource,
  /const updateScript = readString\(field\.updateScript\) \|\| readString\(props\.onChange\)[\s\S]*?delete props\.onChange/,
  'Runtime form designer conversion must preserve legacy onChange code without passing it as a component prop.',
);
assert.match(
  runtimeFormDesignerSource,
  /const props = \{[\s\S]*?if \(designerField\) delete props\.onChange[\s\S]*?key === 'updateScript'/,
  'Clearing a designed onChange value must remove the legacy props.onChange copy before saving.',
);
assert.match(
  runtimeFormFieldEditorSource,
  /const updateScript = readString\(field\.updateScript\) \|\| readString\(field\.props\?\.onChange\)/,
  'Runtime form field editing must load legacy onChange code into the script editor.',
);
assert.match(
  pageRendererRuntimeSource,
  /const actionScript = readString\(event\.payload\?\.script \?\? eventAction\?\.script\)[\s\S]*?executeButtonScript\(actionScript, event\)/,
  'Published form field scripts must execute through the existing isolated page script runtime.',
);
assert.match(
  componentTypeMigrationSource,
  /'form_input_component_type'[\s\S]*?'lc-monaco-editor'[\s\S]*?v_option_count <> 11/,
  'Existing databases must expose the Monaco code input in the form component selector.',
);
assert.match(
  onChangeMigrationSource,
  /'array-table'[\s\S]*?'checkbox'[\s\S]*?'input'[\s\S]*?'picker'[\s\S]*?'radio'[\s\S]*?'rate'[\s\S]*?'slider'[\s\S]*?'stepper'[\s\S]*?'sub-form'[\s\S]*?'switch'/,
  'Every database-backed form input definition must be included in the onChange property migration.',
);
assert.match(
  onChangeMigrationSource,
  /'field', 'onChange'[\s\S]*?'target', 'props'[\s\S]*?'path', 'onChange'[\s\S]*?'component', 'lc-monaco-editor'/,
  'The migrated onChange property must use the dialog-based Monaco editor.',
);

console.log('Low-code Monaco editor dialog regression test passed.');
