import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../../supabase/migrations/20260923160000_print_template_lowcode_save_dialog.sql', import.meta.url),
  'utf8',
);
const designer = await readFile(
  new URL('../pages/dashboard/advanced/print-designer.vue', import.meta.url),
  'utf8',
);
const dialog = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/page-reference-dialog.tsx', import.meta.url),
  'utf8',
);
const runtime = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url),
  'utf8',
);

assert.match(migration, /pageCode: 'print-templates-edit'/);
assert.match(migration, /submitOnConfirm: true/);
assert.match(migration, /formInitialValues:[\s\S]*print-templates-edit-form/);
assert.match(migration, /method: 'getData'/);
assert.match(migration, /method: 'save',[\s\S]*savedRecord/);
assert.match(designer, /formInitialValues:[\s\S]*submitOnConfirm: true/);
assert.match(designer, /page: createTemplateSaveDialogPage\(editPage\)/);
assert.match(designer, /blocks:[\s\S]*filter\(\(block\) => block\.kind !== 'buttonGroup'\)/);
assert.match(designer, /schema: \{ \.\.\.block\.schema, actions: \[\] \}/);
assert.match(designer, /payload\?\.savedRecord/);
assert.doesNotMatch(designer, /async function persistTemplateFromDialog/);
assert.match(dialog, /code: 'confirm',[\s\S]*role: 'confirm'/);
assert.match(runtime, /case 'material\.save':[\s\S]*executeLowCodeMaterialRuntimeAction\(block\.id, 'save', payload\)/);

console.log('Print template save dialog regression test passed.');
