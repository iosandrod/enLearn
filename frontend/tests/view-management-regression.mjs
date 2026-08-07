import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationSource = await readFile(
  new URL(
    '../../supabase/migrations/20260807090000_view_management.sql',
    import.meta.url
  ),
  'utf8'
);
const serviceSource = await readFile(
  new URL(
    '../../api/src/entity-design-service/entity-design.service.ts',
    import.meta.url
  ),
  'utf8'
);
assert.match(
  migrationSource,
  /create table if not exists public\.entity_design_views\s*\(/,
  'View metadata must use its own table.'
);
assert.doesNotMatch(
  migrationSource,
  /entity_design_view_versions|create table[^;]*view[^;]*versions/i,
  'Managed database views must not introduce a version table.'
);

for (const rpc of [
  'list_views',
  'list_view_columns',
  'validate_view',
  'save_view',
  'publish_view',
  'archive_view',
  'delete_view'
]) {
  assert.match(
    migrationSource,
    new RegExp(`create or replace function public\\.entity_design_${rpc}\\(`),
    `The ${rpc} RPC must be installed.`
  );
}

assert.match(
  migrationSource,
  /create or replace function public\.entity_design_save_view\([\s\S]*?security definer/,
  'Mutating view RPCs must run through a controlled security-definer boundary.'
);
assert.match(
  migrationSource,
  /revoke insert, update, delete on public\.entity_design_views from authenticated/,
  'Authenticated users must not write view metadata directly.'
);
assert.doesNotMatch(
  migrationSource,
  /grant execute on function entity_view_private\./,
  'Private DDL helpers must not be directly executable by authenticated users.'
);
assert.match(
  migrationSource,
  /create or replace view %I\.%I with \(security_invoker = true\)/,
  'Published views must honor caller permissions and underlying RLS.'
);
assert.match(
  migrationSource,
  /drop view if exists %I\.%I restrict/,
  'Archiving and deleting must never cascade through view dependencies.'
);
assert.match(
  migrationSource,
  /schemaName and viewName cannot be changed after a managed view is created/,
  'A managed view database identity must remain immutable.'
);

assert.match(
  migrationSource,
  /"code": "entity-views"[\s\S]*?"id": "entity-view-actions"[\s\S]*?"id": "entity-view-main-grid"[\s\S]*?"id": "entity-view-child-tabs"/,
  'The view list must follow the sales-order toolbar, grid, and detail-tabs structure.'
);
assert.match(
  migrationSource,
  /"code": "entity-views-edit"[\s\S]*?"id": "entity-view-edit-actions"[\s\S]*?"id": "entity-view-edit-tabs"[\s\S]*?"id": "entity-view-edit-form"/,
  'View editing must use a separate low-code edit page.'
);
assert.match(
  migrationSource,
  /update public\.lowcode_pages list_page[\s\S]*edit_page_id = edit_page\.id[\s\S]*list_page\.code = 'entity-views'/,
  'Grid edit actions must link to the view edit page.'
);
assert.match(
  migrationSource,
  /'entity-views',[\s\S]*'\/dashboard\/data\/views'[\s\S]*'entity\.views\.manage'[\s\S]*"navigation":"sidebar"/,
  'View management must be permission-gated in the left sidebar.'
);
assert.match(
  migrationSource,
  /"type": "setFormValues"[\s\S]*"id": "\{\{ data\.managedView\.id \}\}"[\s\S]*"type": "navigate"/,
  'Saving a new view must retain its id and update the edit URL.'
);
assert.match(
  migrationSource,
  /"serviceMethod": "saveView"[\s\S]*"serviceMethod": "publishView"/,
  'Publishing must save the current form before creating the database view.'
);

assert.match(
  serviceSource,
  /protected async assertViewAccess[\s\S]*\['entity\.views\.manage'\]/,
  'View methods must use their dedicated service permission.'
);
assert.match(
  serviceSource,
  /function hasBlankViewIdFilter[\s\S]*if \(hasBlankViewIdFilter\(postData\)\) return \[\];/,
  'The new-item route must not hydrate from the first existing view.'
);
console.log('View management regression test passed.');
