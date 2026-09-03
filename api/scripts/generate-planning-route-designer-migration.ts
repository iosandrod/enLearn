import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA,
  PLANNING_ROUTE_DESIGNER_PAGE_CODE,
  PLANNING_ROUTE_DESIGNER_ROUTE,
} from '../src/planning-service/planning-structure-pages.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema,
  type LowCodePageSchema,
} from '../src/lowcode-service/lowcode.schema';

export const PLANNING_ROUTE_DESIGNER_MIGRATION_FILE =
  'supabase/migrations/20260902090000_planning_route_designer_lowcode_page.sql';

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonSql(value: unknown) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function pageSql(input: LowCodePageSchema) {
  const schema = normalizeLowCodePageSchema(input);
  const issues = assertValidLowCodePageSchema(schema);
  if (issues.some((issue) => issue.level === 'error')) {
    throw new Error(`Invalid planning route designer schema: ${JSON.stringify(issues)}`);
  }

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
      or public.lowcode_pages.page_type is distinct from excluded.page_type
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
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
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

export function buildPlanningRouteDesignerMigrationSql() {
  return `-- Store the planning route designer as a database-driven low-code page.

begin;

-- Older navigation provisioning could create this route with a hyphenated page code.
-- Normalize that record first so the route unique constraint does not block the canonical page.
update public.admin_routes
set page_code = null
where path = ${sqlString(PLANNING_ROUTE_DESIGNER_ROUTE)}
  and page_code <> ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)};

update public.lowcode_pages
set code = ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)}
where route = ${sqlString(PLANNING_ROUTE_DESIGNER_ROUTE)}
  and code <> ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)};

${pageSql(PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA)}

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-route-designer', '工艺路线设计', ${sqlString(PLANNING_ROUTE_DESIGNER_ROUTE)},
  parent.id, 'page', 'ri-share-forward-2-line', ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)},
  'planning.models.view', true, true, 'dashboard', 'active', 65,
  '{"group":"advanced","category":"planning","module":"planning","pageKind":"route-designer"}'::jsonb
from public.admin_routes parent
where parent.code = 'advanced-root'
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
    from public.lowcode_pages page
    where page.code = ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)}
      and page.route = ${sqlString(PLANNING_ROUTE_DESIGNER_ROUTE)}
      and page.page_type = 'custom'
      and page.status = 'published'
      and jsonb_array_length(page.schema->'blocks') = 3
  ) then
    raise exception 'The planning route designer low-code page could not be installed.';
  end if;

  if not exists (
    select 1
    from public.lowcode_page_versions version
    join public.lowcode_pages page on page.id = version.page_id
    where page.code = ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)}
      and version.version = page.version
      and version.schema = page.schema
  ) then
    raise exception 'The planning route designer low-code page version could not be installed.';
  end if;

  if not exists (
    select 1
    from public.admin_routes route
    join public.admin_routes parent on parent.id = route.parent_id
    where route.code = 'planning-route-designer'
      and route.path = ${sqlString(PLANNING_ROUTE_DESIGNER_ROUTE)}
      and route.page_code = ${sqlString(PLANNING_ROUTE_DESIGNER_PAGE_CODE)}
      and route.status = 'active'
      and parent.code = 'advanced-root'
  ) then
    raise exception 'The planning route designer navigation route could not be bound to its page.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
`;
}

export async function generatePlanningRouteDesignerMigration() {
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const target = resolve(repoRoot, PLANNING_ROUTE_DESIGNER_MIGRATION_FILE);
  const sql = buildPlanningRouteDesignerMigrationSql();

  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8');
    if (current !== sql) throw new Error(`Planning route designer migration is stale: ${target}`);
    console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql), current: true }));
    return;
  }

  await writeFile(target, sql, 'utf8');
  console.log(JSON.stringify({ target, bytes: Buffer.byteLength(sql) }));
}

void generatePlanningRouteDesignerMigration().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
