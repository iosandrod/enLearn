import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [rendererSource, formSource, editBlockSource, searchBlockSource, typesSource, runtimeSource] =
  await Promise.all([
    readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
    readFile(new URL('components/LowCodeForm.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/form/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('lowcode/block-materials/search-form/index.vue', frameworkRoot), 'utf8'),
    readFile(new URL('types/lowcode.ts', frameworkRoot), 'utf8'),
    readFile(new URL('runtime/page-runtime.ts', frameworkRoot), 'utf8'),
  ]);

assert.match(
  typesSource,
  /defaultValueType\?: 'function' \| 'procedure'[\s\S]*?defaultValueScript\?: string[\s\S]*?defaultValueProcedure\?: string[\s\S]*?updateScript\?: string[\s\S]*?validationScript\?: string/,
  'Field script metadata must be represented by JSON-safe source strings.',
);
assert.match(
  rendererSource,
  /resolveFormDynamicDefaults[\s\S]*?executeDefaultValueProcedure[\s\S]*?executeIsolatedScript\(defaultValueScript, event, 'function'\)[\s\S]*?nextModel\[field\.field\] = cloneRuntimeValue\(value\)/,
  'Function and procedure defaults must resolve before form initialization.',
);
assert.match(
  rendererSource,
  /case 'form\.patch':[\s\S]*?runtime\.patchForm[\s\S]*?getFormController\(blockId\)\?\.setValues/,
  'Update scripts that patch a form must refresh mounted field controls immediately.',
);
assert.match(
  rendererSource,
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
    /script: payload\.field\.updateScript \?\? ''/,
    'Field updates must publish the configured isolated update script.',
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
