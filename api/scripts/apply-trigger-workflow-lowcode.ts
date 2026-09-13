import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL
  ?? env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? env.DATABASE_URL;

if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationFiles = [
  'supabase/migrations/20260909020000_trigger_workflow_current_info.sql',
  'supabase/migrations/20260910030000_trigger_workflow_inline_button_scripts.sql',
  'supabase/migrations/20260910050000_trigger_workflow_save_dialog.sql',
];

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    for (const file of migrationFiles) {
      await client.query(await readFile(resolve(repoRoot, file), 'utf8'));
    }
    const { rows } = await client.query<{
      materials: number;
      source_has_workflow_info: boolean;
      material_version: string | null;
      has_page_functions: boolean;
      has_indirect_toolbar_actions: boolean;
      save_uses_edit_dialog: boolean;
      has_model_edit_form: boolean;
      edit_form_has_draft_schema: boolean;
      edit_form_uses_workflow_service: boolean;
      edit_form_schema_is_parsed_object: boolean;
      material_preserves_model_id: boolean;
      save_support_actions: number;
    }>(`
      select
        (select count(*)::int from public.lowcode_materials where material_kind = 'page' and code = 'trigger-workflow-designer' and enabled and status = 'published') as materials,
        (select source_text like '%:show-workflow-info="true"%' from public.lowcode_materials where material_kind = 'page' and code = 'trigger-workflow-designer') as source_has_workflow_info,
        (select material_version from public.lowcode_materials where material_kind = 'page' and code = 'trigger-workflow-designer') as material_version,
        coalesce((select schema ? 'functions' from public.lowcode_pages where code = 'trigger-workflow-designer'), false) as has_page_functions,
        coalesce((select bool_or(action->>'script' like '%executeFunction(%')
           from public.lowcode_pages page
           cross join lateral jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) block
           cross join lateral jsonb_array_elements(coalesce(block->'actions', '[]'::jsonb)) action
          where page.code = 'trigger-workflow-designer'
            and block->>'id' = 'trigger-workflow-toolbar'), false) as has_indirect_toolbar_actions
        ,coalesce((select bool_or(action->>'script' like '%confirmLowCodePage%workflow-model-management-edit%')
           from public.lowcode_pages page
           cross join lateral jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) block
           cross join lateral jsonb_array_elements(coalesce(block->'actions', '[]'::jsonb)) action
          where page.code = 'trigger-workflow-designer'
            and block->>'id' = 'trigger-workflow-toolbar'
            and action->>'code' = 'trigger-workflow-save'), false) as save_uses_edit_dialog
        ,coalesce((select schema #>> '{blocks,0,id}' = 'edit-form'
           from public.lowcode_pages
          where code = 'workflow-model-management-edit'), false) as has_model_edit_form
        ,exists(
           select 1
             from public.lowcode_pages page
             cross join lateral jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) block
             cross join lateral jsonb_array_elements(coalesce(block#>'{schema,fields}', '[]'::jsonb)) field
            where page.code = 'workflow-model-management-edit'
              and field->>'field' = 'draftSchema'
         ) as edit_form_has_draft_schema
        ,coalesce((select
             schema #>> '{dataSources,edit-form,serviceName}' = 'workflow'
             and schema #>> '{dataSources,edit-form,saveMethod}' = 'saveItem'
             and schema #>> '{blocks,0,sourceKey}' = 'edit-form'
             and schema #>> '{blocks,0,submitSourceKey}' = 'edit-form'
           from public.lowcode_pages
          where code = 'workflow-model-management-edit'), false) as edit_form_uses_workflow_service
        ,exists(
           select 1
             from public.lowcode_pages page
             cross join lateral jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) block
             cross join lateral jsonb_array_elements(coalesce(block#>'{schema,fields}', '[]'::jsonb)) field
            where page.code = 'workflow-model-management-edit'
              and field->>'field' = 'draftSchema'
              and field#>>'{props,jsonRootType}' = 'object'
              and field#>>'{props,jsonValueMode}' = 'parsed'
         ) as edit_form_schema_is_parsed_object
        ,coalesce((select source_text like '%return savedModelId.value ? { ...schema, id: savedModelId.value } : schema;%'
           from public.lowcode_materials
          where material_kind = 'page'
            and code = 'trigger-workflow-designer'), false) as material_preserves_model_id
        ,(select count(*)::int
            from public.lowcode_node_actions
           where node_type = 'triggerWorkflowDesigner'
             and action_code in ('getData', 'validate', 'setData')
             and enabled) as save_support_actions
    `);
    const result = rows[0];
    if (
      result.materials !== 1 ||
      !result.source_has_workflow_info ||
      result.material_version !== '1.0.2' ||
      result.has_page_functions ||
      result.has_indirect_toolbar_actions ||
      !result.save_uses_edit_dialog ||
      !result.has_model_edit_form ||
      !result.edit_form_has_draft_schema ||
      !result.edit_form_uses_workflow_service ||
      !result.edit_form_schema_is_parsed_object ||
      !result.material_preserves_model_id ||
      result.save_support_actions !== 3
    ) {
      throw new Error(`Trigger workflow low-code verification failed: ${JSON.stringify(result)}`);
    }
    console.log('Trigger workflow low-code migrations applied and verified.');
  } catch (error) {
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
