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
  /"code": "entity-views-edit"[\s\S]*?"id": "entity-view-edit-actions"[\s\S]*?"id": "entity-view-edit-tabs"[\s\S]*?"key": "basic"[\s\S]*?"label": "基础信息"[\s\S]*?"id": "entity-view-edit-form"[\s\S]*?"id": "entity-view-columns-tabs"[\s\S]*?"label": "视图字段"[\s\S]*?"id": "entity-view-edit-columns-grid"/,
  'View editing must follow the sales-order edit structure: one toolbar, a basic form, and a separate detail grid.'
);
assert.match(
  migrationSource,
  /"id": "entity-view-edit-actions"[\s\S]*?"code": "back"[\s\S]*?"code": "refresh"[\s\S]*?"code": "save-view"[\s\S]*?"code": "create-view-from-sql"[\s\S]*?"code": "more"/,
  'All edit-page commands must live in the single toolbar above the basic-information section.'
);
assert.doesNotMatch(
  migrationSource,
  /"id": "entity-view-detail-actions"/,
  'The edit page must not render a second toolbar between its basic and detail sections.'
);
assert.match(
  migrationSource,
  /"id": "entity-view-edit-form"[\s\S]*?"layout": \[[\s\S]*?"field": "title"[\s\S]*?"field": "code"[\s\S]*?"field": "status"[\s\S]*?"field": "schema_name"[\s\S]*?"field": "view_name"[\s\S]*?"field": "definition_sql"[\s\S]*?"field": "description"/,
  'The basic-information form must use an explicit compact row layout like the option-source edit form.'
);
assert.match(
  migrationSource,
  /"field": "definition_sql"[\s\S]*?"component": "lc-monaco-editor"[\s\S]*?"dialog": true[\s\S]*?"language": "sql"/,
  'The compact SQL field must retain a full SQL editor through its dialog control.'
);
assert.match(
  migrationSource,
  /"id": "entity-view-edit-actions"[\s\S]*?"code": "more"[\s\S]*?"children": \[[\s\S]*?"code": "validate"[\s\S]*?"code": "publish"[\s\S]*?"code": "archive"[\s\S]*?"code": "delete"/,
  'Secondary view operations must remain grouped beneath the top toolbar More menu.'
);
assert.match(
  migrationSource,
  /"apis": \{[\s\S]*?"analyzeViewSql"[\s\S]*?"serviceMethod": "validateView"[\s\S]*?"resultPath": "columns"/,
  'The edit page must expose SQL analysis through a named page API alias.'
);
assert.match(
  migrationSource,
  /"code": "create-view-from-sql"[\s\S]*?async function main\(\)[\s\S]*?this\.executeAction[\s\S]*?node: 'sql-dialog'[\s\S]*?this\.executeHttp[\s\S]*?api: 'analyzeViewSql'[\s\S]*?node: 'entity-view-edit-form'[\s\S]*?definition_sql: formData\.sql[\s\S]*?node: 'entity-view-edit-columns-grid'[\s\S]*?method: 'reloadData'[\s\S]*?data: columns/,
  'The edit-page create button must write SQL to the form and analyzed columns to the separate detail grid.'
);
assert.match(
  migrationSource,
  /"id": "sql-dialog"[\s\S]*?"resultNode": "sql-dialog-form"[\s\S]*?"field": "sql"[\s\S]*?"language": "sql"/,
  'The create flow must use a page-owned SQL form dialog.'
);
assert.match(
  migrationSource,
  /create temporary view[\s\S]*?pg_attribute[\s\S]*?'columns', v_columns/,
  'SQL validation must return analyzed result-column metadata without publishing a managed view.'
);
assert.match(
  migrationSource,
  /entity_design_list_view_columns[\s\S]*?jsonb_array_length\(v_result\) = 0[\s\S]*?v_view\.metadata->'columns'[\s\S]*?jsonb_array_elements/,
  'The edit detail grid must load analyzed metadata for drafts and physical columns for published views.'
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
  /"id": "entity-view-edit-actions"[\s\S]*?"code": "publish"[\s\S]*?"serviceMethod": "saveView"[\s\S]*?"serviceMethod": "publishView"/,
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
