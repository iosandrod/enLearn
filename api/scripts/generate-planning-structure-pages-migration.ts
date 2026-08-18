import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_BOM_PAGE_SCHEMA,
  PLANNING_ROUTING_PAGE_SCHEMA,
  PLANNING_STRUCTURE_ROUTES
} from '../src/planning-service/planning-structure-pages.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema,
  type LowCodePageSchema
} from '../src/lowcode-service/lowcode.schema';

export const PLANNING_STRUCTURE_PAGES_MIGRATION_FILE =
  'supabase/migrations/20260811120000_planning_structure_pages.sql';

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonSql(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function pageSql(input: LowCodePageSchema) {
  const schema = normalizeLowCodePageSchema(input);
  assertValidLowCodePageSchema(schema);
  return `insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  ${sqlString(schema.code)}, ${sqlString(schema.route)}, ${sqlString(schema.title)},
  ${sqlString(schema.description ?? '')}, 'custom', 'dashboard', 'published', true,
  ${jsonSql(schema)}, 1, timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = ${sqlString(schema.code)}
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;`;
}

function routeSql() {
  const values = PLANNING_STRUCTURE_ROUTES.map((route) => `(
    ${sqlString(route.code)}, ${sqlString(route.title)}, ${sqlString(route.path)},
    (select id from public.admin_routes where code = 'planning-1'),
    'page', ${sqlString(route.icon)}, ${sqlString(route.pageCode)}, 'planning.models.view',
    true, true, 'dashboard', 'active', ${route.sortOrder},
    '{"module":"planning","group":"基础数据","pageKind":"structure-view"}'::jsonb
  )`).join(',\n');

  return `insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values
${values}
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
  updated_at = timezone('utc'::text, now());`;
}

export function buildPlanningStructurePagesMigrationSql() {
  return `-- Add dedicated routing and BOM views to Planning > Basic Data.

begin;

${pageSql(PLANNING_ROUTING_PAGE_SCHEMA)}

${pageSql(PLANNING_BOM_PAGE_SCHEMA)}

do $$
begin
  if not exists (select 1 from public.admin_routes where code = 'planning-1') then
    raise exception 'The planning-1 Basic Data route is required for routing and BOM views.';
  end if;
end $$;

${routeSql()}

select pg_notify('pgrst', 'reload schema');

commit;
`;
}

export async function generatePlanningStructurePagesMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, PLANNING_STRUCTURE_PAGES_MIGRATION_FILE);
  const sql = buildPlanningStructurePagesMigrationSql();

  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8');
    if (current !== sql) throw new Error(`Planning structure pages migration is stale: ${target}`);
    console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql), current: true }));
    return;
  }

  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql) }));
}

if (require.main === module) {
  void generatePlanningStructurePagesMigration();
}

