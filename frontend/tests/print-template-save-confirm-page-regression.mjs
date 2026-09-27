import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../../supabase/migrations/20260927110000_print_template_save_confirm_page.sql', import.meta.url),
  'utf8',
);
const applyScript = await readFile(
  new URL('../../api/scripts/apply-print-template-multipage-save.ts', import.meta.url),
  'utf8',
);
const designer = await readFile(
  new URL('../pages/dashboard/advanced/print-designer.vue', import.meta.url),
  'utf8',
);

assert.match(migration, /this\.\$dialog\.confirmLowCodePage\(\{/);
assert.match(migration, /pageCode: 'print-templates-edit'/);
assert.match(migration, /formInitialValues:[\s\S]*print-templates-edit-form/);
assert.match(migration, /disableFormAutoLoad: true/);
assert.match(migration, /disablePageAutoLoad: true/);
assert.match(migration, /submitOnConfirm: true/);
assert.match(migration, /savedRecord/);
assert.doesNotMatch(migration, /method: 'save'/);
assert.match(applyScript, /20260927110000_print_template_save_confirm_page\.sql/);
assert.match(applyScript, /this\.\$dialog\.confirmLowCodePage/);
assert.match(applyScript, /pageCode: 'print-templates-edit'/);
assert.match(designer, /async function openTemplatePicker\(\)[\s\S]*await prefetchPrintDesignerLowCodeResources\(\)/);
assert.match(
  designer,
  /function applyTemplateDocumentContent\([\s\S]*?ensureStoreIsUsable[\s\S]*?editor\.setCurrentPage\(firstPageId\)/,
  'Template loading must repair missing camera/page-state records before switching pages.',
);

console.log('Print template save confirm-page regression test passed.');
