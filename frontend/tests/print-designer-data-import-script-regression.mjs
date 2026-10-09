import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, dialogSource, runtimeSource, toolbarSource] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260927120000_print_designer_data_import.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/runtime/page-reference-dialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/lowcode-framework/src/runtime/print-detail-toolbar.ts', import.meta.url), 'utf8'),
]);

assert.match(migration, /action\.value ->> 'code' = 'label-excel'/);
assert.match(migration, /workspace\.printDataSource/);
assert.match(migration, /请先填写数据源/);
assert.match(migration, /name: 'confirmForm'/);
assert.match(migration, /formInitialValues: \{ \[formCode\]: rows \}/);
assert.match(dialogSource, /formCode\?: string/);
assert.match(dialogSource, /lowcode_form_definitions/);
assert.match(dialogSource, /schema\.fields/);
assert.match(dialogSource, /createImportFormSchema/);
assert.match(dialogSource, /const detailLayout = normalizedDetailFields\.map/);
assert.match(dialogSource, /layout: \[\.\.\.headerLayout, \.\.\.detailLayout\]/);
assert.match(toolbarSource, /label: '新增行'/);
assert.match(toolbarSource, /label: '导入'/);
assert.match(dialogSource, /enlearn:print-data-source-import/);
assert.match(dialogSource, /onImported:/);
assert.match(toolbarSource, /label: '清空'/);
assert.match(dialogSource, /copyable: existingProps\.copyable !== false/);
assert.match(dialogSource, /removable: existingProps\.removable !== false/);
assert.match(runtimeSource, /'formCode'/);

console.log('Print designer data import script regression test passed.');
