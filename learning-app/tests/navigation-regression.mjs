import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/navigation-model.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const moduleSource = result.outputFiles[0].text;
const navigation = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

const rows = navigation.normalizeMobileNavigationRows([
  {
    id: 'container', code: 'business', title: 'Business', path: '/business',
    route_type: 'group', metadata: { navigation: 'container' },
  },
  {
    id: 'sales', code: 'sales', title: 'Sales', path: '/sales', parent_id: 'container',
    route_type: 'group', metadata: { navigation: 'sidebar' },
  },
  {
    id: 'orders', code: 'sales-orders', title: 'Orders', path: '/dashboard/sales/orders',
    parent_id: 'sales', page_code: 'sales-orders', sort_order: 10,
  },
  {
    id: 'desktop', code: 'designer', title: 'Designer', path: '/designer',
    page_code: 'designer', metadata: { navigation: 'top-tool' },
  },
]);

const menu = navigation.buildMobileMenu(rows);
assert.equal(menu.length, 1);
assert.equal(menu[0].code, 'sales');
assert.equal(menu[0].children[0].page_code, 'sales-orders');
assert.equal(navigation.flattenMobileNavigation(menu).length, 2);
assert.equal(
  navigation.resolveMobileRuntimePath('/dashboard/sales/orders?id=7', rows),
  '/page/sales-orders?id=7',
);
assert.equal(navigation.resolveMobileRuntimePath('sales-orders', rows), '/page/sales-orders');
assert.equal(navigation.resolveMobileRuntimePath('/unmapped/web/path', rows), '');
assert.equal(navigation.filterMobileMenu(menu, 'orders')[0].children.length, 1);
assert.equal(navigation.parentMobilePageCode('sales-orders', rows), '');

const nestedRows = navigation.normalizeMobileNavigationRows([
  ...rows,
  {
    id: 'orders-edit', code: 'sales-order-edit', title: 'Order Edit', path: '/sales/edit',
    parent_id: 'orders', page_code: 'sales-order-edit', metadata: { navigation: 'hidden' },
  },
]);
assert.equal(navigation.parentMobilePageCode('sales-order-edit', nestedRows), 'sales-orders');

console.log('mobile navigation regression checks passed');
