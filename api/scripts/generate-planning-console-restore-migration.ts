import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_CONSOLE_PAGE_CODE,
  PLANNING_CONSOLE_PAGE_SCHEMA,
  PLANNING_CONSOLE_ROUTE
} from '../src/planning-service/planning-console.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema
} from '../src/lowcode-service/lowcode.schema';

const TARGET = 'supabase/migrations/20260905130000_restore_planning_console_schema.sql';

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql() {
  const schema = normalizeLowCodePageSchema(PLANNING_CONSOLE_PAGE_SCHEMA);
  assertValidLowCodePageSchema(schema);
  return `-- Restore the canonical planning console schema without relying on the base initializer.

begin;

with desired as (
  select ${sqlString(JSON.stringify(schema))}::jsonb as schema
), updated as (
  update public.lowcode_pages page
  set route = ${sqlString(PLANNING_CONSOLE_ROUTE)},
      title = '排产控制台',
      description = '集中查看需求、计划、资源、物料、约束和 frePPLe 运行结果。',
      page_type = 'custom',
      layout = 'dashboard',
      status = 'published',
      keep_alive = true,
      schema = desired.schema,
      version = case
        when page.schema is distinct from desired.schema then page.version + 1
        else page.version
      end,
      published_at = case
        when page.schema is distinct from desired.schema then timezone('utc'::text, now())
        else page.published_at
      end,
      updated_at = case
        when page.schema is distinct from desired.schema then timezone('utc'::text, now())
        else page.updated_at
      end
  from desired
  where page.code = ${sqlString(PLANNING_CONSOLE_PAGE_CODE)}
  returning page.id
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select page.id, page.version, page.schema, page.published_at
from public.lowcode_pages page
where page.code = ${sqlString(PLANNING_CONSOLE_PAGE_CODE)}
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $$
begin
  if not exists (
    select 1
    from public.lowcode_pages page
    cross join lateral jsonb_path_query(
      page.schema,
      'strict $.** ? (@.id == "planning_console_demands_grid" && @.tableType == "main")'
    ) as block
    where page.code = ${sqlString(PLANNING_CONSOLE_PAGE_CODE)}
  ) then
    raise exception 'The canonical planning console schema could not be restored.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
`;
}

async function main() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, TARGET);
  await writeFile(target, buildSql(), 'utf8');
  console.log(JSON.stringify({ target }));
}

void main();
