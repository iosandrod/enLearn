import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../../supabase/migrations/20260921110000_print_template_picker_page_functions.sql', import.meta.url),
  'utf8',
);
const pageScriptRuntime = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url),
  'utf8',
);

for (const definition of [
  ['system:page:common.confirmLowCodePage', 'confirmLowCodePage'],
  ['system:page:common.confirmForm', 'confirmForm'],
]) {
  assert.match(migration, new RegExp(`${definition[0]}[\\s\\S]*?'${definition[1]}'`));
}

assert.match(
  migration,
  /page_id = null[\s\S]*?page_type = null[\s\S]*?capabilities = '\["dialog\.confirmLowCodePage"\]'/,
  'Picker functions must be public to every low-code page type and use the registered dialog capability.',
);
assert.match(
  migration,
  /code' = 'label-load'[\s\S]*?name: "confirmLowCodePage"[\s\S]*?pageCode: "print-templates"[\s\S]*?requireSelection: true[\s\S]*?method: "loadData"[\s\S]*?templateId: result\.row\.id/,
  'The print designer load button must select a template page row before loading the canvas.',
);
assert.match(
  migration,
  /selectedPrintTemplateRows,postData,filters,id[\s\S]*?00000000-0000-0000-0000-000000000000[\s\S]*?= '__none__'/,
  'The template picker must not send its inactive child data source an invalid UUID placeholder.',
);
assert.doesNotMatch(
  migration,
  /code' = 'label-load'[\s\S]*?method: "loadData"\s*}\);\s*}\s*\$script\$/,
  'The load button must not keep the old parameterless loadData implementation.',
);
assert.match(
  pageScriptRuntime,
  /const sourceKey = 'sourceKey' in block[\s\S]*?readString\(block\.sourceKey, block\.id\)[\s\S]*?: block\.id/,
  'Database grid loadData actions must write to the configured sourceKey used by the picker grid.',
);

console.log('Print template picker page-functions regression test passed.');
