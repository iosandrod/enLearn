import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migrationSource, applyScriptSource] = await Promise.all([
  readFile(
    new URL('../../supabase/migrations/20260809180000_canonical_sub_form_schema.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../api/scripts/apply-canonical-sub-form-schema.ts', import.meta.url),
    'utf8',
  ),
]);

assert.match(
  migrationSource,
  /with recursive walk[\s\S]*?jsonb_each[\s\S]*?jsonb_array_elements/,
  'The migration must traverse nested JSON objects and arrays.',
);
assert.match(
  migrationSource,
  /props - 'fields' - 'columns' - 'layout' - 'actions'[\s\S]*?\{schema\}/,
  'The migration must remove legacy sibling keys and write props.schema.',
);
assert.match(
  migrationSource,
  /update public\.lowcode_pages[\s\S]*?version = page\.version \+ 1[\s\S]*?insert into public\.lowcode_page_versions/,
  'Changed pages must receive a new matching page-version record.',
);
assert.match(
  migrationSource,
  /update public\.lowcode_form_definitions/,
  'Database-backed form definitions must be canonicalized.',
);
assert.match(
  migrationSource,
  /legacy_count <> 0 or invalid_count <> 0/,
  'The migration must fail when any legacy or invalid sub-form remains.',
);
assert.match(
  applyScriptSource,
  /legacyFixture[\s\S]*?component: 'lc-sub-form'[\s\S]*?verifyLegacyFixture/,
  'The database runner must exercise a nested legacy fixture.',
);
assert.match(
  applyScriptSource,
  /fixture\.preserved_title !== 'Preserved'[\s\S]*?fixture\.outer_columns !== 2/,
  'The fixture must verify canonical precedence and migrated legacy metadata.',
);

console.log('Canonical lc-sub-form database migration regression test passed.');
