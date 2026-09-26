import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260925120000_print_template_multipage_save.sql';

async function main() {
  const env = getEnv();
  const connectionStrings = [env.DIRECT_URL, process.env.DIRECT_URL, env.DATABASE_URL, process.env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  let lastError: unknown;

  for (const rawConnectionString of connectionStrings) {
    const url = new URL(normalizePostgresConnectionString(rawConnectionString));
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const client = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.query(migration);
      const { rows } = await client.query<{ action_count: number; load_action_count: number; save_script: string | null; source_text: string | null }>(`
        select
          (select count(*)::int from public.lowcode_node_actions
           where node_type = 'labelDesigner' and action_code = 'getTemplateInfo'
             and enabled and is_system) as action_count,
          (select count(*)::int from public.lowcode_node_actions
           where node_type = 'labelDesigner' and action_code = 'loadData'
             and enabled and is_system) as load_action_count,
          (select source_text from public.lowcode_materials
           where material_kind = 'page' and code = 'label-designer') as source_text,
          (select action.value ->> 'script'
           from public.lowcode_pages page
           cross join lateral jsonb_array_elements(page.schema -> 'blocks') block(value)
           cross join lateral jsonb_array_elements(block.value -> 'actions') action(value)
           where page.code = 'print-designer'
             and block.value ->> 'id' = 'label-designer-actions'
             and action.value ->> 'code' = 'label-save') as save_script
      `);
      const source = rows[0]?.source_text ?? '';
      if (
        rows[0]?.action_count !== 1 ||
        rows[0]?.load_action_count !== 1 ||
        !rows[0]?.save_script?.includes("method: 'getTemplateInfo'") ||
        source.includes('\\n') ||
        !source.includes('getTemplateInfo,') ||
        !source.includes('normalizePageContent')
      ) {
        throw new Error('Print template multi-page save migration verification failed.');
      }
      const invalidPageCount = await client.query<{ count: number }>(`
        select count(*)::int as count
        from public.print_templates
        where content ? 'pages'
          and exists (
            select 1
            from jsonb_array_elements(content -> 'pages') page
            where not (
              page ? 'id' and page ? 'name' and page ? 'content'
              and (page -> 'content') ? 'schema'
              and jsonb_typeof(page -> 'content' -> 'shapes') = 'array'
              and jsonb_typeof(page -> 'content' -> 'rootShapeIds') = 'array'
              and jsonb_typeof(page -> 'content' -> 'assets') = 'array'
            )
          )
      `);
      if ((invalidPageCount.rows[0]?.count ?? 0) > 0) {
        throw new Error('Print template page content validation failed.');
      }
      console.log(JSON.stringify({ applied: true, nodeActions: ['labelDesigner.getTemplateInfo', 'labelDesigner.loadData'], saveScriptUpdated: true }));
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw lastError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
