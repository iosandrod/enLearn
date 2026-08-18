import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const [materialSource, materialEntrySource, arrayTableSource, designerSource] = await Promise.all([
  readFile(
    new URL('lowcode/form-materials/lc-monaco-editor/index.vue', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL('lowcode/form-materials/lc-monaco-editor/index.ts', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL('lowcode/form-materials/lc-array-table/index.vue', frameworkRoot),
    'utf8',
  ),
  readFile(
    new URL(
      'visual-editor/components/button-group-designer/button-group-designer.service.tsx',
      frameworkRoot,
    ),
    'utf8',
  ),
]);

assert.match(
  materialEntrySource,
  /type: 'lc-monaco-editor'[\s\S]*?component/,
  'The Monaco editor must be registered as a reusable low-code form material.',
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
  /<LcMonacoEditor[\s\S]*?column\.component === 'lc-monaco-editor'[\s\S]*?setCell/,
  'Array-table columns must support the Monaco form material.',
);
assert.match(
  designerSource,
  /field: 'script'[\s\S]*?title: '(?:执行脚本|鎵ц鑴氭湰)'[\s\S]*?component: 'lc-monaco-editor'[\s\S]*?dialog: true[\s\S]*?language: 'javascript'[\s\S]*?scriptThisType: 'LowCodeButtonScriptThis'/,
  'The button designer must expose a JavaScript execution-script column in dialog mode.',
);

console.log('Low-code Monaco editor dialog regression test passed.');
