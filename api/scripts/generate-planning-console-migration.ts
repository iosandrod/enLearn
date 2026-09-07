import { readFile, writeFile } from 'node:fs/promises';
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

export const PLANNING_CONSOLE_MIGRATION_FILE =
  'supabase/migrations/20260809120000_planning_console.sql';

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonSql(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

export function buildPlanningConsoleMigrationSql() {
  const schema = normalizeLowCodePageSchema(PLANNING_CONSOLE_PAGE_SCHEMA);
  assertValidLowCodePageSchema(schema);

  return `-- Register the planning console low-code page in the Advanced tools menu.

begin;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  ${sqlString(PLANNING_CONSOLE_PAGE_CODE)},
  ${sqlString(PLANNING_CONSOLE_ROUTE)},
  '排产控制台',
  '集中查看需求、计划、资源、物料、约束和 frePPLe 运行结果。',
  'custom',
  'dashboard',
  'published',
  true,
  ${jsonSql(schema)},
  1,
  timezone('utc'::text, now())
)
on conflict (code) do nothing;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = ${sqlString(PLANNING_CONSOLE_PAGE_CODE)}
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-console',
  '排产控制台',
  ${sqlString(PLANNING_CONSOLE_ROUTE)},
  advanced_root.id,
  'page',
  'ri-calendar-schedule-line',
  ${sqlString(PLANNING_CONSOLE_PAGE_CODE)},
  'planning.models.view',
  true,
  true,
  'dashboard',
  'active',
  70,
  '{"group":"advanced","category":"planning","module":"planning","pageKind":"console"}'::jsonb
from public.admin_routes advanced_root
where advanced_root.code = 'advanced-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $$
begin
  if not exists (
    select 1
    from public.admin_routes route
    join public.admin_routes parent on parent.id = route.parent_id
    where route.code = 'planning-console'
      and parent.code = 'advanced-root'
  ) then
    raise exception 'The advanced-root route is required for the planning console.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
`;
}

export async function generatePlanningConsoleMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, PLANNING_CONSOLE_MIGRATION_FILE);
  const sql = buildPlanningConsoleMigrationSql();
  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8');
    if (current !== sql) {
      throw new Error(`Planning console migration is stale: ${target}`);
    }
    console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql), current: true }));
    return;
  }
  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql) }));
}

if (require.main === module) {
  void generatePlanningConsoleMigration();
}
