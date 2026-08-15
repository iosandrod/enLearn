import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [apiSource, designerSource, migrationSource] = await Promise.all([
  readFile(new URL('../src/lowcode-script-apis.ts', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/advanced/print-designer.vue', import.meta.url), 'utf8'),
  readFile(
    new URL('../../supabase/migrations/20260814130000_sales_order_print_designer_dialog.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  apiSource,
  /registerLowCodeScriptApi\('print\.designer\.open'[\s\S]*?openSalesOrderPrintDesigner/,
  'The sales-order print API must be registered.',
);
assert.match(
  apiSource,
  /openGlobalDialog\(\{[\s\S]*?className: 'print-designer-dialog'[\s\S]*?body: \(\) => h\(PrintDesigner, \{ embedded: true \}\)/,
  'The print designer must open through openGlobalDialog in embedded mode.',
);
assert.doesNotMatch(
  apiSource,
  /<template|templateUrl|\.html['"]|\.vue['"]\s*,\s*\{\s*template/,
  'The print action must reuse the component instead of creating a template file.',
);
assert.match(
  designerSource,
  /<GlobalDialogHost v-if="!embedded"[\s\S]*?embedded\?: boolean/,
  'Embedded print designers must reuse the parent global-dialog host.',
);
assert.match(
  migrationSource,
  /'sales-order-actions'[\s\S]*?'print'[\s\S]*?this\.\$api\.invoke\("print\.designer\.open"[\s\S]*?'apiNames'[\s\S]*?api\.invoke/,
  'The sales-order print button must invoke the authorized print designer API.',
);

console.log('Sales-order print designer regression test passed.');
