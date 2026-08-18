import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260817100000_repair_dynamic_route_edit_binding.sql',
    import.meta.url,
  ),
  'utf8',
);

const sourceMatch = migrationSource.match(
  /v_record_source jsonb := \$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/,
);
assert.ok(sourceMatch, 'The repaired record data source must be embedded in the migration.');
const recordSource = JSON.parse(sourceMatch[1]);

assert.deepEqual(recordSource, {
  key: 'record',
  label: '编辑信息',
  sourceType: 'table',
  serviceName: 'admin',
  serviceMethod: 'listItems',
  saveMethod: 'saveItem',
  tableName: 'admin_routes',
  postData: {
    resource: 'admin_routes',
    tableName: 'admin_routes',
    filters: { id: '{{ route.query.id }}' },
    requiredFilters: ['id'],
    limit: 1,
  },
  autoLoad: true,
});

assert.match(
  migrationSource,
  /jsonb_set\([\s\S]*'\{dataSources,record\}'[\s\S]*v_record_source/,
  'The runtime page must use the repaired record source.',
);
assert.match(
  migrationSource,
  /block->>'kind' = 'form'[\s\S]*'sourceKey', 'record'[\s\S]*'submitSourceKey', 'record'/,
  'The edit form must read from and submit to the repaired record source.',
);
assert.match(
  migrationSource,
  /v_visual_source_props[\s\S]*"serviceMethod": "listItems"[\s\S]*"saveMethod": "saveItem"[\s\S]*"postDataJson"/,
  'The visual form properties must be repaired so a later designer save keeps the binding.',
);
assert.match(
  migrationSource,
  /'\{visualEditor,pages,\/,blocks\}'[\s\S]*block->>'componentKey' in \('form', 'lowcode-edit-form'\)[\s\S]*v_visual_source_props/,
  'The visual edit-form block must receive the repaired source properties.',
);
assert.match(
  migrationSource,
  /insert into public\.lowcode_page_versions[\s\S]*v_version \+ 1/,
  'The repaired page must publish a matching version record.',
);
assert.match(
  migrationSource,
  /list_page\.code = 'admin-system-routes'/,
  'The dynamic-route list page must remain linked to the repaired edit page.',
);

console.log('Dynamic-route edit page regression test passed.');
