import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const originalMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260803093000_sales_order_lowcode_page.sql',
    import.meta.url,
  ),
  'utf8',
);
const migration = await readFile(
  new URL(
    '../../supabase/migrations/20260809100000_fix_sales_order_list_page_type.sql',
    import.meta.url,
  ),
  'utf8',
);

assert.match(
  originalMigration,
  /"code":\s*"sales-orders"[\s\S]*?"pageType":\s*"list"/,
  'A fresh database must create the sales-order page as a list page.',
);
assert.match(
  migration,
  /where code = 'sales-orders-edit'/,
  'The migration must resolve the sales-order edit page instead of hard-coding its id.',
);
assert.match(
  migration,
  /where code = 'sales-orders'[\s\S]*?for update/,
  'The sales-order list page must be locked while its version is updated.',
);
assert.match(
  migration,
  /v_next_schema := jsonb_set\([\s\S]*?v_current_schema[\s\S]*?'\{pageType\}'[\s\S]*?'list'/,
  'The migration must patch pageType on the current schema without replacing button configuration.',
);
assert.match(
  migration,
  /page_type = 'list'[\s\S]*?edit_page_id = v_edit_page_id/,
  'The list page must expose list metadata and retain its edit-page relationship.',
);
assert.match(
  migration,
  /when v_changed then v_current_version \+ 1[\s\S]*?insert into public\.lowcode_page_versions/,
  'A real metadata change must increment the page version and create a snapshot.',
);
assert.doesNotMatch(
  migration,
  /"blocks"\s*:/,
  'The corrective migration must not replace the current runtime blocks or saved buttons.',
);

console.log('Sales-order list page type regression test passed.');
