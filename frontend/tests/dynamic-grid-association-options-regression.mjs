import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [
  migration,
  adminService,
  requestResolver,
  designer,
  form,
  fieldTypes,
  optionRegistry,
  applyScript,
  bareTableMigration,
  bareTableApplyScript,
  gridDesignerMigration,
] = await Promise.all([
  readSource('../../supabase/migrations/20260809110000_dynamic_grid_association_options.sql'),
  readSource('../../api/src/admin-service/admin.service.ts'),
  readSource('../../packages/lowcode-framework/src/runtime/data-source-request-resolver.ts'),
  readSource('../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx'),
  readSource('../../packages/lowcode-framework/src/components/LowCodeForm.vue'),
  readSource('../../packages/lowcode-framework/src/types/lowcode.ts'),
  readSource('../../packages/lowcode-framework/src/runtime/option-source-registry.ts'),
  readSource('../../api/scripts/apply-dynamic-grid-association-options.ts'),
  readSource('../../supabase/migrations/20260810135000_bare_grid_table_options.sql'),
  readSource('../../api/scripts/apply-bare-grid-table-options.ts'),
  readSource('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql'),
]);

for (const viewName of [
  'system_physical_table_options',
  'system_database_view_options',
]) {
  assert.match(
    migration,
    new RegExp(`create or replace view public\\.${viewName}[\\s\\S]*?as[\\s\\S]*?value[\\s\\S]*?label`),
    `${viewName} must return the common label/value option shape.`,
  );
}
assert.match(
  migration,
  /create or replace view public\.system_physical_table_options[\s\S]*tables\.table_name::text as value[\s\S]*tables\.table_name::text as label/,
  'Physical-table options must return bare table names without the public schema prefix.',
);
assert.doesNotMatch(
  migration,
  /tables\.table_schema \|\| '\\.' \|\| tables\.table_name as (?:value|label)/,
  'Physical-table dropdown labels and values must not include public.',
);
assert.match(
  bareTableMigration,
  /create or replace view public\.system_physical_table_options[\s\S]*tables\.table_name::text as value[\s\S]*tables\.table_name::text as label/,
  'Existing deployments must receive the bare table-name option view.',
);
assert.match(
  bareTableApplyScript,
  /prefixed_option_count !== 0/,
  'The focused apply script must reject public-prefixed table options.',
);

for (const [code, name] of [
  ['physical_table_name', '真实表名'],
  ['database_view_name', '视图'],
]) {
  assert.ok(migration.includes(`'${code}'`), `${name} must be seeded as an option source.`);
}
assert.match(
  migration,
  /delete from public\.system_option_items[\s\S]*physical_table_name[\s\S]*database_view_name/,
  'The dynamic catalog sources must not depend on manual option-item rows.',
);
assert.match(
  migration,
  /'field', 'source_target'[\s\S]*\\5173\\8054\\89C6\\56FE\/PG\\51FD\\6570\\540D\\79F0/,
  'The option-source list must add the associated view/PG function column.',
);
assert.match(
  migration,
  /\{blocks,1,schema,grid,columns\}[\s\S]*\{visualEditor,pages,\/,blocks,1,props,columns\}/,
  'The migration must update both runtime and visual grid columns without scanning the full schema.',
);

assert.match(
  adminService,
  /method === 'resolveOptionItems'[\s\S]*return this\.resolveOptionItems\(postData, context\)/,
  'The admin service must expose the dynamic option resolver.',
);
assert.match(
  adminService,
  /method === 'resolveOptionItemsBatch'[\s\S]*return this\.resolveOptionItemsBatch\(postData, context\)/,
  'The admin service must expose the batch option resolver.',
);
assert.match(
  adminService,
  /\.from\('system_option_sources'\)[\s\S]*\.in\('code', sourceCodes\)[\s\S]*Promise\.all\(sourceCodes\.map/,
  'The batch resolver must load all source definitions in one query.',
);
assert.match(
  adminService,
  /sourceType === 'table' \|\| sourceType === 'view'[\s\S]*resolveRelationOptionItems[\s\S]*sourceType === 'rpc'[\s\S]*resolveRpcOptionItems/,
  'The dynamic resolver must execute relation and PostgreSQL-function sources.',
);
assert.match(
  adminService,
  /source_target: readOptionSourceTarget\(row\)/,
  'List rows must derive the display-only source target from source_config.',
);
assert.match(
  requestResolver,
  /legacyDynamicOptionListMethods[\s\S]*'listOptionItems'[\s\S]*serviceMethod: 'resolveOptionItems'/,
  'Legacy dynamic option calls must no longer be flattened into system_option_items reads.',
);

for (const [field, sourceCode] of [
  ['tableName', 'physical_table_name'],
  ['viewName', 'database_view_name'],
]) {
  assert.match(
    gridDesignerMigration,
    new RegExp(`"field": "${field}"[\\s\\S]*?"component": "vxe-select"[\\s\\S]*?"optionsCode": "${sourceCode}"`),
    `${field} must use a searchable select backed by optionsCode.`,
  );
}
assert.doesNotMatch(
  designer,
  /loadAssociationOptions|physicalTableOptions|databaseViewOptions|invoke<unknown\[\]>\('admin', 'resolveOptionItems'/,
  'Opening the grid designer must not explicitly load association options.',
);
assert.match(fieldTypes, /optionsCode\?: string;/, 'Low-code fields must persist optionsCode.');
assert.match(
  form,
  /const codes = optionsCodes\.value[\s\S]*lowCodeOptionSourceRegistry\.subscribe\([\s\S]*codeOptionSources\[code\] = options/,
  'The generic form renderer must subscribe to option codes automatically.',
);
assert.match(
  optionRegistry,
  /resolveOptionItemsBatch[\s\S]*sourceCodes: codes[\s\S]*globalThis as GlobalOptionRegistryScope[\s\S]*globalScope\[GLOBAL_REGISTRY_KEY\]/,
  'Options must use one global registry and one batch API call.',
);
assert.match(
  optionRegistry,
  /BATCH_WINDOW_MS[\s\S]*setTimeout[\s\S]*pendingCodes/,
  'Option-code collection must be throttled before the batch request.',
);
assert.match(
  optionRegistry,
  /cache: Map<string, OptionCacheEntry>[\s\S]*inFlight: Map<string[\s\S]*subscribers: Map<string/,
  'The global option registry must cache values, in-flight work, and subscribers.',
);
assert.match(
  designer,
  /applyAssociationOption[\s\S]*loadPhysicalTableSource[\s\S]*applySource[\s\S]*syncActiveDesignerDialogModel/,
  'Selecting a dropdown option must continue to load and merge source columns.',
);
assert.match(
  applyScript,
  /source_count !== 2[\s\S]*item_count !== 0[\s\S]*table_option_count < 1[\s\S]*prefixed_table_option_count !== 0[\s\S]*page_column_count !== 1/,
  'The apply script must verify both sources, no option-item rows, bare table names, returned options, and the list column.',
);

console.log('Dynamic grid association options regression test passed.');
