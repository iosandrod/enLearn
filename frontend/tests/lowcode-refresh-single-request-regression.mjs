import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rendererSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue', import.meta.url),
  'utf8',
);
const salesOrderPageSource = await readFile(
  new URL(
    '../../supabase/migrations/20260803093000_sales_order_lowcode_page.sql',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  salesOrderPageSource,
  /"code": "refresh"[\s\S]*?"type": "refreshDataSource", "sourceKeys": \["salesOrders"\]/,
  'The sales-order refresh button must explicitly refresh only salesOrders.',
);
assert.match(
  rendererSource,
  /function hasEnabledRefreshDirective[\s\S]*?'refreshDataSource'[\s\S]*?'refreshDataSources'[\s\S]*?'refreshPage'/,
  'The runtime must recognize explicit refresh directives.',
);
assert.match(
  rendererSource,
  /if \(action\.code === 'refresh'\) \{\s*if \(hasEnabledRefreshDirective\(action\)\) return;\s*await loadPageData\(props\.page\);/,
  'An explicit refresh directive must suppress the legacy full-page refresh.',
);

console.log('Low-code single-request refresh regression test passed.');
