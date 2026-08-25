import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260824120000_auto_create_lowcode_page_for_admin_route.sql',
    import.meta.url,
  ),
  'utf8',
);
const adminServiceSource = await readFile(
  new URL('../../api/src/admin-service/admin.service.ts', import.meta.url),
  'utf8',
);

assert.match(
  migrationSource,
  /NEW\.page_code := nullif\(btrim\(NEW\.page_code\), ''\)[\s\S]*NEW\.route_type <> 'page'[\s\S]*NEW\.page_code is not null/,
  'Only unbound page routes should receive an automatic low-code page.',
);
assert.match(
  migrationSource,
  /insert into public\.lowcode_pages[\s\S]*insert into public\.lowcode_page_versions/,
  'Route provisioning must create both the page and its initial version.',
);
assert.match(
  migrationSource,
  /NEW\.page_code := v_page_code/,
  'The generated page code must be written back to the route row.',
);
assert.match(
  migrationSource,
  /before insert or update of code, path, title, route_type, page_code, layout, keep_alive/,
  'The provisioning trigger must cover route creation and relevant route changes.',
);
assert.match(
  adminServiceSource,
  /allowedFields: \[[^\]]*'page_code'[^\]]*'layout'/,
  'Admin route writes must allow page bindings and layout values.',
);

console.log('Admin route low-code page provisioning regression test passed.');
