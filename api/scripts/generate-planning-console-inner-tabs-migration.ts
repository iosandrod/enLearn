import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_CONSOLE_PAGE_SCHEMA,
  type PlanningConsoleInnerTabs,
  selectPlanningConsoleInnerTabs
} from '../src/planning-service/planning-console.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema
} from '../src/lowcode-service/lowcode.schema';

export const PLANNING_CONSOLE_INNER_TABS_MIGRATION_FILE =
  'supabase/migrations/20260810100000_planning_console_inner_tabs.sql';

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonSql(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function textSql(value: string) {
  return sqlString(value);
}

function innerTabSql(tabs: PlanningConsoleInnerTabs) {
  return Object.entries(tabs).map(([tabKey, block]) => `
  v_next_schema := pg_temp.set_lowcode_tab_blocks(
    v_next_schema,
    'planning_console_tabs',
    ${textSql(tabKey)},
    jsonb_build_array(${jsonSql(block)})
  );`).join('');
}

export function buildPlanningConsoleInnerTabsMigrationSql() {
  const schema = normalizeLowCodePageSchema(PLANNING_CONSOLE_PAGE_SCHEMA);
  assertValidLowCodePageSchema(schema);
  const innerTabs = selectPlanningConsoleInnerTabs(schema);

  return `-- Group the planning-console detail grids into inner tabs.

begin;

create or replace function pg_temp.set_lowcode_tab_blocks(
  p_document jsonb,
  p_tabs_block_id text,
  p_tab_key text,
  p_blocks jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_tabs jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_tabs_block_id
        and jsonb_typeof(p_document -> 'tabs') = 'array'
      then
        select jsonb_agg(
          case
            when item.value ->> 'key' = p_tab_key
              then jsonb_set(item.value, '{blocks}', p_blocks, true)
            else item.value
          end
          order by item.ordinality
        )
        into v_tabs
        from jsonb_array_elements(p_document -> 'tabs')
          with ordinality as item(value, ordinality);

        return jsonb_set(p_document, '{tabs}', coalesce(v_tabs, '[]'::jsonb), true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.set_lowcode_tab_blocks(
          entry.value,
          p_tabs_block_id,
          p_tab_key,
          p_blocks
        )
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.set_lowcode_tab_blocks(
          item.value,
          p_tabs_block_id,
          p_tab_key,
          p_blocks
        )
        order by item.ordinality
      )
      into v_result
      from jsonb_array_elements(p_document)
        with ordinality as item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

do $$
declare
  v_page_id uuid;
  v_current_version integer;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_next_version integer;
  v_published_at timestamptz;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'planning_console'
  for update;

  if v_page_id is null then
    return;
  end if;

  v_next_schema := v_current_schema;${innerTabSql(innerTabs)}

  if v_current_schema = v_next_schema then
    return;
  end if;

  v_next_version := v_current_version + 1;
  v_published_at := timezone('utc'::text, now());

  update public.lowcode_pages
  set schema = v_next_schema,
      version = v_next_version,
      published_at = v_published_at,
      updated_at = v_published_at
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, v_published_at)
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

notify pgrst, 'reload schema';

commit;
`;
}

export async function generatePlanningConsoleInnerTabsMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, PLANNING_CONSOLE_INNER_TABS_MIGRATION_FILE);
  const sql = buildPlanningConsoleInnerTabsMigrationSql();

  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8');
    if (current !== sql) {
      throw new Error(`Planning console inner-tabs migration is stale: ${target}`);
    }
    console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql), current: true }));
    return;
  }

  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql) }));
}

if (require.main === module) {
  void generatePlanningConsoleInnerTabsMigration();
}
