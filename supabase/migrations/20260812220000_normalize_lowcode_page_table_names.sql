-- Store public-schema table names in lowcode_pages without the redundant schema prefix.

update public.lowcode_pages
set table_name = pg_catalog.regexp_replace(
  pg_catalog.btrim(table_name),
  '^public\.',
  '',
  'i'
)
where table_name is not null
  and (
    table_name is distinct from pg_catalog.btrim(table_name)
    or pg_catalog.btrim(table_name) ~* '^public\.'
  );

comment on column public.lowcode_pages.table_name is
  'Primary physical table associated with the page; the public schema prefix is omitted.';

alter table public.lowcode_pages
  drop constraint if exists lowcode_pages_table_name_without_public_check;

alter table public.lowcode_pages
  add constraint lowcode_pages_table_name_without_public_check
  check (
    table_name is null
    or pg_catalog.btrim(table_name) !~* '^public\.'
  );

create or replace function public.dynamic_crud_normalize_lowcode_page(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_page_type text;
  v_table_name text;
begin
  if pg_catalog.jsonb_typeof(payload->'table_name') = 'string' then
    v_table_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(payload->>'table_name'),
      '^public\.',
      '',
      'i'
    );
    payload := pg_catalog.jsonb_set(
      payload,
      '{table_name}',
      pg_catalog.to_jsonb(v_table_name),
      false
    );
  end if;

  v_page_type := nullif(payload->>'page_type', '');
  if v_page_type is null and pg_catalog.jsonb_typeof(payload->'schema') = 'object' then
    v_page_type := nullif(payload->'schema'->>'pageType', '');
  end if;

  if v_page_type is null and context->>'action' = 'update' then
    return payload;
  end if;
  v_page_type := coalesce(v_page_type, 'custom');
  if v_page_type not in ('list', 'edit', 'detail', 'custom') then
    raise exception 'page_type must be list, edit, detail, or custom.' using errcode = '22023';
  end if;
  return payload || pg_catalog.jsonb_build_object('page_type', v_page_type);
end;
$function$;
