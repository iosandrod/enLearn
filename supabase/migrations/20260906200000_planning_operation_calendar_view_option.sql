-- Use the account-scoped calendar option view for the operation edit form.
-- The operation row itself may still be read from planning_operation_view;
-- this only changes how available_id choices are loaded.

begin;

create or replace function pg_temp.bind_operation_calendar_option(value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  result jsonb;
begin
  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(pg_temp.bind_operation_calendar_option(item) order by ordinal),
      '[]'::jsonb
    )
    into result
    from jsonb_array_elements(value) with ordinality items(item, ordinal);
    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  select coalesce(
    jsonb_object_agg(key, pg_temp.bind_operation_calendar_option(item)),
    '{}'::jsonb
  )
  into result
  from jsonb_each(value) entries(key, item);

  if result->>'field' = 'available_id'
     and result->>'optionsSourceKey' = 'planning_calendarOptions' then
    return (result - 'optionsSourceKey') || jsonb_build_object(
      'optionsCode', 'planning_calendar_options_source'
    );
  end if;

  return result;
end;
$function$;

with changed_pages as (
  select
    pages.id,
    pages.schema,
    pg_temp.bind_operation_calendar_option(pages.schema) as next_schema
  from public.lowcode_pages pages
  where pages.code = 'planning_operation-edit'
), updated_pages as (
  update public.lowcode_pages pages
  set
    schema = changed_pages.next_schema,
    version = pages.version + 1,
    published_at = case
      when pages.status = 'published' then timezone('utc'::text, now())
      else pages.published_at
    end,
    updated_at = timezone('utc'::text, now())
  from changed_pages
  where pages.id = changed_pages.id
    and changed_pages.next_schema is distinct from changed_pages.schema
  returning pages.id, pages.version, pages.schema, pages.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from updated_pages
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if exists (
    select 1
    from public.lowcode_pages pages
    cross join lateral jsonb_path_query(
      pages.schema,
      '$.** ? (@.field == "available_id")'
    ) as fields(value)
    where pages.code = 'planning_operation-edit'
      and fields.value->>'optionsCode' = 'planning_calendar_options_source'
  ) then
    null;
  else
    raise exception 'planning_operation-edit available_id is not bound to planning_calendar_options_source.';
  end if;
end;
$validation$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values (
  '20260906200000',
  'planning_operation_calendar_view_option',
  array['Bound planning_operation-edit available_id to the planning_calendar_options_source view']
)
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

select pg_catalog.pg_notify('pgrst', 'reload schema');

commit;
