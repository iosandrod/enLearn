import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const [migration, gridMigration] = await Promise.all([
  readFile(new URL('supabase/migrations/20260910040000_edit_form_request_params_subform.sql', root), 'utf8'),
  readFile(new URL('supabase/migrations/20260908010000_grid_designer_request_params_subform.sql', root), 'utf8'),
]);

assert.match(migration, /code in \('material-prop\.form', 'material-prop\.lowcode-edit-form'\)/);
assert.match(migration, /v_request_schema jsonb/);
assert.match(migration, /definition\.code = 'grid-designer'/);
assert.match(migration, /field ->> 'component' = 'lc-sub-form'/);
assert.match(migration, /'component', 'lc-sub-form'/);
assert.match(migration, /'target', 'props'/);
assert.match(migration, /'path', 'postDataJson'/);
assert.match(migration, /'valueKind', 'raw'/);
assert.match(migration, /'defaultValue', '\{\}'::jsonb/);
assert.match(migration, /'label', '请求参数'/);
assert.match(migration, /'key', 'request-params'/);
assert.match(migration, /'field', 'postDataJson'/);
assert.match(migration, /block ->> 'field' <> 'postDataJson'/);
assert.match(migration, /jsonb_set\(v_schema, '\{layout,0,tabs\}', v_tabs, true\)/);
assert.match(gridMigration, /"field": "filters", "label": "筛选条件", "component": "lc-array-table"/);

console.log('Edit form request params sub-form regression test passed.');
