import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260805100000_system_option_source_edit_page.sql',
    import.meta.url
  ),
  'utf8'
);
const repairMigrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260812190000_restore_option_source_detail_grid.sql',
    import.meta.url
  ),
  'utf8'
);
const formBindingMigrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260826150000_bind_option_items_filter_to_form.sql',
    import.meta.url
  ),
  'utf8'
);
const adminServiceSource = await readFile(
  new URL('../../api/src/admin-service/admin.service.ts', import.meta.url),
  'utf8'
);
const visualDesignerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/LowCodeVisualDesigner.vue',
    import.meta.url
  ),
  'utf8'
);
const pageDataControllerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/page-data-controller.ts',
    import.meta.url
  ),
  'utf8'
);
const schemaMatch = migrationSource.match(/\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
assert.ok(schemaMatch, 'The option-source edit page schema must be embedded in the migration.');
const pageSchema = JSON.parse(schemaMatch[1]);

function findBlock(blocks, id) {
  for (const block of blocks ?? []) {
    if (block.id === id) return block;

    const nestedBlocks = [
      ...(Array.isArray(block.blocks) ? block.blocks : []),
      ...(Array.isArray(block.tabs)
        ? block.tabs.flatMap((tab) => (Array.isArray(tab.blocks) ? tab.blocks : []))
        : []),
    ];
    const nestedMatch = findBlock(nestedBlocks, id);
    if (nestedMatch) return nestedMatch;
  }

  return undefined;
}

assert.match(
  migrationSource,
  /"code": "admin-system-options-edit"[\s\S]*"pageType": "edit"[\s\S]*"keepAlive": false/,
  'The option-source edit page must be a complete non-cached edit page.'
);
assert.match(
  migrationSource,
  /"filters": \{ "id": "\{\{ route\.query\.id \}\}" \}[\s\S]*"requiredFilters": \["id"\]/,
  'The edit page must load the row selected by the list page.'
);
assert.match(
  migrationSource,
  /"id": "option-source-edit-form"[\s\S]*"sourceKey": "optionSource"[\s\S]*"submitSourceKey": "optionSource"/,
  'The main form must read and save the option-source record.'
);
const optionSourceForm = findBlock(pageSchema.blocks, 'option-source-edit-form');
assert.ok(optionSourceForm, 'The option-source edit form must exist.');
assert.deepEqual(
  optionSourceForm.schema.actions,
  [],
  'The option-source edit form must not render Save or Reset buttons.'
);
for (const field of [
  'code',
  'name',
  'source_type',
  'status',
  'cache_ttl_seconds',
  'sort_order',
  'is_system',
  'description',
  'source_config_json',
]) {
  assert.match(
    migrationSource,
    new RegExp(`"field": "${field}"`),
    `The edit form must expose ${field}.`
  );
}
assert.match(
  migrationSource,
  /"key": "items"[\s\S]*"id": "option-source-items-grid"[\s\S]*"sourceKey": "optionItems"/,
  'The edit page must include the related dictionary item view.'
);
assert.match(
  repairMigrationSource,
  /jsonb_path_exists\([\s\S]*\.blocks\[\*\][\s\S]*option-source-items-grid[\s\S]*jsonb_build_array\(v_detail_grid\)/,
  'The repair migration must restore the missing detail Grid idempotently.'
);
assert.match(
  repairMigrationSource,
  /\{dataSources,optionSource,autoLoad\}[\s\S]*\{dataSources,optionItems,loadAfterSourceKeys\}[\s\S]*\["optionSource"\]/,
  'The detail source must wait until the edited option source has loaded.'
);
assert.match(
  formBindingMigrationSource,
  /\{dataSources,optionItems,postData,filters,source_code\}[\s\S]*\{\{ forms\.option-source-edit-form\.code \}\}/,
  'The dictionary-detail filter must bind to the option-source edit form.'
);
assert.match(
  formBindingMigrationSource,
  /version = coalesce\(v_version, 0\) \+ 1[\s\S]*insert into public\.lowcode_page_versions/,
  'The form-binding migration must version the updated page schema.'
);
assert.match(
  visualDesignerSource,
  /function preserveDataSourceRuntimeSettings[\s\S]*previousSource\.autoLoad/,
  'Visual saves must preserve data-source auto-loading that is not exposed by the designer.'
);
assert.match(
  visualDesignerSource,
  /function preserveDataSourceRuntimeSettings[\s\S]*previousSource\.loadAfterSourceKeys[\s\S]*preserveDataSourceRuntimeSettings\(/,
  'Visual saves must preserve data-source loading order that is not exposed by the designer.'
);
assert.match(
  migrationSource,
  /update public\.lowcode_pages as list_page[\s\S]*edit_page_id = edit_page\.id[\s\S]*list_page\.code = 'admin-system-options'/,
  'The list page must stay linked to the completed edit page.'
);
assert.match(
  adminServiceSource,
  /allowedFields: \['code', 'name', 'description', 'source_type', 'source_config', 'cache_ttl_seconds', 'status', 'sort_order', 'is_system'\]/,
  'Option-source saves must preserve the cache TTL field.'
);
assert.match(
  adminServiceSource,
  /afterList: \[this\.attachOptionSourceConfigJson\][\s\S]*afterUpdate: \[this\.attachOptionSourceConfigJson\]/,
  'Option-source reads and saves must expose editable source_config JSON.'
);
assert.match(
  pageDataControllerSource,
  /saveFormSource[\s\S]*resolveDataSourceRequest\(source\.key, source\)[\s\S]*\.invoke\(serviceName, serviceMethod, \{\s*\.\.\.request\.postData,/,
  'Form saves must submit resolved data-source templates.'
);

console.log('System option-source edit page regression test passed.');
