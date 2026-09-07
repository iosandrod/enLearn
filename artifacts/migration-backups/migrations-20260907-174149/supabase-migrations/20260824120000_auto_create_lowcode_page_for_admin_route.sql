-- Provision a low-code page whenever a database-backed page route is created
-- without an explicit page binding. The trigger keeps route creation atomic
-- across admin_routes, lowcode_pages, and lowcode_page_versions.

create or replace function public.ensure_admin_route_lowcode_page()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_page_code text;
  v_existing_code text;
  v_schema jsonb;
  v_published_at timestamptz;
begin
  NEW.page_code := nullif(btrim(NEW.page_code), '');
  if NEW.route_type <> 'page' or NEW.page_code is not null then
    return NEW;
  end if;

  -- Reuse a page already serving the same route before generating a new code.
  select code
  into v_existing_code
  from public.lowcode_pages
  where route = NEW.path
  limit 1;

  if v_existing_code is not null then
    NEW.page_code := v_existing_code;
    return NEW;
  end if;

  v_page_code := NEW.code;
  if exists (select 1 from public.lowcode_pages where code = v_page_code) then
    v_page_code := NEW.code || '-page';
    while exists (select 1 from public.lowcode_pages where code = v_page_code) loop
      v_page_code := v_page_code || '-page';
    end loop;
  end if;

  v_published_at := timezone('utc'::text, now());
  v_schema := jsonb_build_object(
    'schemaVersion', 1,
    'code', v_page_code,
    'route', NEW.path,
    'title', NEW.title,
    'description', '',
    'pageType', 'custom',
    'layout', coalesce(NEW.layout, 'dashboard'),
    'status', 'published',
    'keepAlive', coalesce(NEW.keep_alive, true),
    'dataSources', '{}'::jsonb,
    'blocks', '[]'::jsonb
  );

  insert into public.lowcode_pages (
    code,
    route,
    title,
    description,
    layout,
    status,
    keep_alive,
    page_type,
    schema,
    version,
    created_by,
    updated_by,
    published_at
  ) values (
    v_page_code,
    NEW.path,
    NEW.title,
    '',
    coalesce(NEW.layout, 'dashboard'),
    'published',
    coalesce(NEW.keep_alive, true),
    'custom',
    v_schema,
    1,
    NEW.created_by,
    NEW.updated_by,
    v_published_at
  );

  insert into public.lowcode_page_versions (
    page_id,
    version,
    schema,
    created_by,
    published_at
  )
  select
    id,
    1,
    v_schema,
    NEW.created_by,
    v_published_at
  from public.lowcode_pages
  where code = v_page_code;

  NEW.page_code := v_page_code;
  return NEW;
end;
$function$;

drop trigger if exists ensure_admin_route_lowcode_page on public.admin_routes;
create trigger ensure_admin_route_lowcode_page
before insert or update of code, path, title, route_type, page_code, layout, keep_alive
on public.admin_routes
for each row
execute function public.ensure_admin_route_lowcode_page();

revoke all on function public.ensure_admin_route_lowcode_page()
from public;

select pg_notify('pgrst', 'reload schema');
