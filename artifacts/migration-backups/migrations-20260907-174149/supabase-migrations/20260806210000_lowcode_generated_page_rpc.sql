-- Atomic generated-page save used by the CLI and low-code tooling.

create or replace function public.save_generated_lowcode_page(
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_page public.lowcode_pages%rowtype;
  v_version integer;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
     or nullif(btrim(v_payload->>'code'), '') is null
     or nullif(btrim(v_payload->>'route'), '') is null
     or nullif(btrim(v_payload->>'title'), '') is null
     or jsonb_typeof(v_payload->'schema') <> 'object' then
    raise exception 'code, route, title, and schema are required.' using errcode = '22023';
  end if;

  perform 1
  from public.lowcode_pages
  where code = btrim(v_payload->>'code')
  for update;
  select coalesce(max(version), 0) + 1 into v_version
  from public.lowcode_pages
  where code = btrim(v_payload->>'code');

  insert into public.lowcode_pages (
    code, route, title, description, layout, status, keep_alive, page_type,
    schema, version, published_at, updated_at
  ) values (
    btrim(v_payload->>'code'), btrim(v_payload->>'route'), btrim(v_payload->>'title'),
    nullif(v_payload->>'description', ''), coalesce(nullif(v_payload->>'layout', ''), 'dashboard'),
    coalesce(nullif(v_payload->>'status', ''), 'published'),
    coalesce((v_payload->>'keep_alive')::boolean, true),
    coalesce(nullif(v_payload->>'page_type', ''), 'custom'),
    v_payload->'schema', v_version, v_now, v_now
  )
  on conflict (code) do update set
    route = excluded.route,
    title = excluded.title,
    description = excluded.description,
    layout = excluded.layout,
    status = excluded.status,
    keep_alive = excluded.keep_alive,
    page_type = excluded.page_type,
    schema = excluded.schema,
    version = excluded.version,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at
  returning * into v_page;

  insert into public.lowcode_page_versions (
    page_id, version, schema, published_at, created_at
  ) values (v_page.id, v_page.version, v_page.schema, v_now, v_now)
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;

  return to_jsonb(v_page);
end;
$function$;

revoke all on function public.save_generated_lowcode_page(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_generated_lowcode_page(jsonb)
  to service_role;
