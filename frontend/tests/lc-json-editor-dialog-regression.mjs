import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editorSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/form-materials/lc-json-editor/index.vue',
    import.meta.url,
  ),
  'utf8',
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

console.log('Low-code JSON editor dialog regression test passed.');
