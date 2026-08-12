import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [gridSource, migrationSource, applySource] = await Promise.all([
  readFile(new URL('../../packages/lowcode-framework/src/components/LowCodeGrid.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260813110000_sales_order_item_base_info.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../api/scripts/apply-sales-order-item-base-info.ts', import.meta.url), 'utf8'),
]);

assert.match(
  gridSource,
  /#baseInfoEdit[\s\S]*?patchBaseInfoRow[\s\S]*?component === 'base-info'[\s\S]*?edit: 'baseInfoEdit'/,
  'Editable grids must render and apply base-info relation patches.',
);
assert.match(
  migrationSource,
  /sales-orders-edit[\s\S]*?sales-order-lines-grid[\s\S]*?item_code[\s\S]*?'component', 'base-info'[\s\S]*?'resource', 'planning_item'/,
  'The sales-order item-code column must use planning-item base-info.',
);
for (const [sourceField, targetField] of [
  ['id', 'item_id'],
  ['name', 'item_code'],
  ['display_name', 'item_name'],
  ['description', 'item_spec'],
  ['category', 'item_category_name'],
  ['uom', 'uom_name'],
]) {
  assert.match(
    migrationSource,
    new RegExp(`'sourceField', '${sourceField}', 'targetField', '${targetField}'`),
    `Missing material mapping ${sourceField} -> ${targetField}.`,
  );
}
assert.match(
  applySource,
  /20260813090000_planning_item_display_name\.sql[\s\S]*?20260813110000_sales_order_item_base_info\.sql[\s\S]*?mappingCount/,
  'The database runner must install and verify material base-info configuration.',
);

console.log('Sales-order item base-info regression test passed.');
