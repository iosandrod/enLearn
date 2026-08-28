import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [
  dataControllerSource,
  scriptRuntimeSource,
  rendererInteractionsSource,
  scriptWorkerSource,
  formSource,
  editBlockSource,
  searchBlockSource,
  typesSource,
  runtimeSource,
  migrationSource,
  cleanupMigrationSource,
] =
  await Promise.all([
    readFile(new URL('runtime/page-data-controller.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/lowcode-page-script-runtime.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/useLowCodePageRenderer.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/script-runtime.worker.ts', frameworkRoot), 'utf8'),
    readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/form/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/search-form/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('types/lowcode.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/page-runtime.ts', frameworkRoot), 'utf8'),
    readFile(
      new URL('../../supabase/migrations/20260828120000_use_default_value_for_function_defaults.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../supabase/migrations/20260828130000_clear_dynamic_form_default_initial_values.sql', import.meta.url),
      'utf8',
    ),
  ]);

assert.match(
  typesSource,
  /defaultValueType\?: 'function' \| 'procedure'[\s\S]*?defaultValue\?: unknown[\s\S]*?defaultValueProcedure\?: string[\s\S]*?updateScript\?: string[\s\S]*?validationScript\?: string/,
  'Field metadata must store function default source in defaultValue.',
);
assert.match(
  dataControllerSource,
  /resolveFormDynamicDefaults[\s\S]*?hasConfiguredDynamicDefault[\s\S]*?hasStaleEmptyInitialValue[\s\S]*?executeDefaultValueProcedure[\s\S]*?executeIsolatedScript\(defaultValue, event, 'function'\)[\s\S]*?nextModel\[field\.field\] = cloneRuntimeValue\(normalizeDynamicDefaultValue\(field, value\)\)/,
  'Function and procedure defaults must resolve before form initialization, including legacy empty initial values.',
);
assert.match(
  dataControllerSource,
  /formatDynamicDateValue[\s\S]*?normalizeDynamicDefaultValue[\s\S]*?normalizeDynamicDefaultValue\(field, value\)/,
  'Date-like dynamic defaults must be formatted for VXE date inputs.',
);
assert.match(
  scriptWorkerSource,
  /createConfiguredFunctionSource[\s\S]*?const __configuredFunction = \([\s\S]*?typeof __configuredFunction !== "function"[\s\S]*?await __configuredFunction\.call\(this, this\.event\)/,
  'Function defaults must parse the configured source, invoke it with the runtime event, and await its return value.',
);
assert.match(
  dataControllerSource,
  /resolveGridDynamicDefaults[\s\S]*?const defaultValue = readString\(field\.defaultValue\)[\s\S]*?executeIsolatedScript\(defaultValue, event, 'function'\)[\s\S]*?editRender\.defaultValue = cloneRuntimeValue\([\s\S]*?normalizeDynamicDefaultValue/,
  'Function defaults must also set the initial value for editable grid columns.',
);
assert.doesNotMatch(
  dataControllerSource,
  /defaultValueScript/,
  'Runtime default resolution must not depend on the removed defaultValueScript field.',
);
assert.match(
  migrationSource,
  /lowcode_move_function_default_value[\s\S]*?defaultValueType' = 'function'[\s\S]*?jsonb_set\(result, '\{defaultValue\}', result->'defaultValueScript'[\s\S]*?return result - 'defaultValueScript'/,
  'Existing function defaults must migrate from defaultValueScript to defaultValue.',
);
assert.match(
  cleanupMigrationSource,
  /lowcode_clear_dynamic_form_default_initial_values[\s\S]*?defaultValueType' in \('function', 'procedure'\)[\s\S]*?\{initialValues\}[\s\S]*?- dynamic_fields/,
  'Existing pages must remove stale initial values for fields with dynamic defaults.',
);
assert.match(
  dataControllerSource,
  /hasPersistedFormRecord[\s\S]*?skipAllocatingDefaults[\s\S]*?deriveNewFormModel = async[\s\S]*?field\.defaultValueType === 'function' \|\| field\.defaultValueType === 'procedure'[\s\S]*?delete values\[field\.field\][\s\S]*?return this\.resolveFormDynamicDefaults\(block, values\)/,
  'Create and copy must rebuild function defaults before a form is initialized.',
);
assert.match(
  scriptRuntimeSource,
  /async resetBuiltinForms[\s\S]*?await deriveNewFormModel\(block, mode, current\)[\s\S]*?runtime\.replaceForm\(block\.id, values\)/,
  'Create and copy must replace each form with the same fully resolved default object used at initialization.',
);
assert.match(
  scriptRuntimeSource,
  /case 'form\.patch':[\s\S]*?runtime\.patchForm[\s\S]*?getFormController\(blockId\)\?\.setValues/,
  'Update scripts that patch a form must refresh mounted field controls immediately.',
);
assert.match(
  rendererInteractionsSource,
  /executeFieldScript: async \(script, event\)[\s\S]*?executeIsolatedScript\(script, event\)/,
  'Field validators must use the page isolated-script bridge.',
);
assert.match(
  formSource,
  /field\.validationScript && props\.fieldValidator[\s\S]*?createFieldValidationRule\(field\)[\s\S]*?await props\.fieldValidator/,
  'LowCodeForm must surface asynchronous validation-script failures through VXE rules.',
);
assert.match(
  formSource,
  /async function validate\(\)[\s\S]*?await vxeFormRef\.value\?\.validate\(\)/,
  'Form submission must await VXE validation, including asynchronous field scripts.',
);
assert.doesNotMatch(
  formSource,
  /validateFieldScripts/,
  'Validation scripts must run once through VXE so failures are rendered on the field.',
);
for (const source of [editBlockSource, searchBlockSource]) {
  assert.match(
    source,
    /const script = onChangeScript \|\| payload\.field\.updateScript \|\| '';[\s\S]*?script,/,
    'Field updates must publish the configured isolated update script when no component onChange script is configured.',
  );
  assert.match(
    source,
    /runtimeBlockEditor\.executeFieldScript\(field\.validationScript/,
    'Field validation must execute through the runtime block editor bridge.',
  );
}
assert.match(
  runtimeSource,
  /replaceForm\(blockId, values\)[\s\S]*?clearRecord\(current\)[\s\S]*?Object\.assign\(current, values\)[\s\S]*?patchForm\(blockId, values\)[\s\S]*?Object\.assign\(state\.forms\[blockId\], values\)/,
  'Form script patches must retain reactive model identity so controls update immediately.',
);

console.log('Runtime form field scripts regression test passed.');
