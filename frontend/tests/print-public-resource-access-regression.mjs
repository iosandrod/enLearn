import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [designer, expressions, manager, gateway, migration] = await Promise.all([
  readFile(new URL('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/print/expressions.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/PrintRemoteDataSourceManager.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/gateway/service-gateway.controller.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20261013010000_resource_access_level.sql', import.meta.url), 'utf8'),
]);

assert.match(designer, /resource:\s*'print_templates'/);
assert.doesNotMatch(designer, /tableName:\s*'print_templates'/);
assert.match(expressions, /resource:\s*'print_expressions'/);
assert.match(manager, /resource:\s*'print_datasource_script'/);
assert.match(manager, /readOnlyCatalog/);
assert.match(gateway, /allowMetadataPublicRead/);
assert.match(migration, /publicRead/);
assert.match(migration, /can_read_access_level_resource/);
assert.match(migration, /drop column if exists visibility/);
assert.match(migration, /create event trigger access_level_resource_ddl/);
assert.match(migration, /revoke select on %s from public, anon, authenticated/);
assert.doesNotMatch(migration, /grant select on public\.print_datasource_script to anon/);

console.log('Print public resource access regression tests passed.');
