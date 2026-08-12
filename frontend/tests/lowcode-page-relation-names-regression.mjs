import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [migration, normalizationMigration, resources, apiTypes, frontendTypes, frameworkTypes] = await Promise.all([
  readSource('../../supabase/migrations/20260809210000_lowcode_page_relation_names.sql'),
  readSource('../../supabase/migrations/20260812220000_normalize_lowcode_page_table_names.sql'),
  readSource('../../api/src/lowcode-service/lowcode.resources.ts'),
  readSource('../../api/src/lowcode-service/lowcode.types.ts'),
  readSource('../types/database.ts'),
  readSource('../../packages/lowcode-framework/src/types/lowcode.ts'),
]);

assert.match(
  migration,
  /alter table public\.lowcode_pages[\s\S]*add column if not exists view_name text[\s\S]*add column if not exists table_name text/,
  'The page table must add both nullable relation-name columns.',
);
assert.match(
  migration,
  /main_sources[\s\S]*source_candidates[\s\S]*entity_candidates[\s\S]*picked_relations/,
  'Backfill must resolve the primary source from page blocks, data sources, and entity metadata.',
);
assert.match(
  migration,
  /parent\.edit_page_id = child\.id[\s\S]*child\.view_name[\s\S]*parent\.table_name/,
  'Linked edit pages must inherit the list page relation.',
);
assert.match(
  migration,
  /'field', 'view_name'[\s\S]*'field', 'table_name'[\s\S]*lowcode-page-main-grid/,
  'The low-code page management grid must display both relation fields.',
);
assert.match(
  normalizationMigration,
  /update public\.lowcode_pages[\s\S]*set table_name = pg_catalog\.regexp_replace/,
  'Existing low-code page table names must be normalized.',
);
assert.match(
  normalizationMigration,
  /add constraint lowcode_pages_table_name_without_public_check[\s\S]*btrim\(table_name\) !~\* '\^public\\\.'/,
  'The database must reject future public-qualified table_name values.',
);
assert.match(
  normalizationMigration,
  /dynamic_crud_normalize_lowcode_page[\s\S]*jsonb_typeof\(payload->'table_name'\)[\s\S]*jsonb_set/,
  'Dynamic CRUD writes must strip the public schema prefix.',
);

for (const source of [resources, apiTypes, frontendTypes, frameworkTypes]) {
  assert.match(source, /view_name/);
  assert.match(source, /table_name/);
}
assert.match(resources, /'view_name'[\s\S]*'table_name'/);

console.log('Low-code page relation-name regression passed.');
