-- Dynamic table/view dropdown sources for the grid designer.

create or replace view public.system_physical_table_options
with (security_invoker = true)
as
select
  tables.table_name::text as value,
  tables.table_name::text as label
from information_schema.tables tables
where tables.table_schema = 'public'
  and tables.table_type = 'BASE TABLE';

create or replace view public.system_database_view_options
with (security_invoker = true)
as
select
  views.table_schema || '.' || views.table_name as value,
  views.table_schema || '.' || views.table_name as label
from information_schema.views views
where views.table_schema = 'public';

grant select on public.system_physical_table_options to authenticated;
grant select on public.system_database_view_options to authenticated;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
) values
  (
    'physical_table_name',
    U&'\771F\5B9E\8868\540D',
    U&'\8FD4\56DE public schema \4E2D\7684\6240\6709\771F\5B9E\8868\540D\3002',
    'view',
    jsonb_build_object(
      'view', 'public.system_physical_table_options',
      'labelField', 'label',
      'valueField', 'value',
      'orderBy', 'value',
      'limit', 1000
    ),
    60,
    'active',
    30,
    true
  ),
  (
    'database_view_name',
    U&'\89C6\56FE',
    U&'\8FD4\56DE public schema \4E2D\7684\6240\6709\53EF\7528\89C6\56FE\540D\3002',
    'view',
    jsonb_build_object(
      'view', 'public.system_database_view_options',
      'labelField', 'label',
      'valueField', 'value',
      'orderBy', 'value',
      'limit', 1000
    ),
    60,
    'active',
    40,
    true
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code in ('physical_table_name', 'database_view_name');

create or replace function public.__enlearn_add_source_target_column(columns jsonb)
returns jsonb
language sql
immutable
as $function$
  select case
    when jsonb_typeof(columns) <> 'array' then columns
    when exists (
      select 1 from jsonb_array_elements(columns) item
      where item->>'field' = 'source_target'
    ) then columns
    else (
      select coalesce(jsonb_agg(column_item order by ordinal), '[]'::jsonb)
      from (
        select column_item, (ordinal * 2)::numeric as ordinal
        from jsonb_array_elements(columns) with ordinality items(column_item, ordinal)
        union all
        select jsonb_build_object(
          'field', 'source_target',
          'title', U&'\5173\8054\89C6\56FE/PG\51FD\6570\540D\79F0',
          'minWidth', 240,
          'showOverflow', 'tooltip',
          'formatter', jsonb_build_object('type', 'text', 'emptyText', '-')
        ), coalesce((
          select ordinal * 2 + 1
          from jsonb_array_elements(columns) with ordinality items(column_item, ordinal)
          where column_item->>'field' = 'source_type'
          limit 1
        ), 1)::numeric
      ) ordered_columns
    )
  end
$function$;

update public.lowcode_pages
set
  schema = jsonb_set(
    jsonb_set(
      schema,
      '{blocks,1,schema,grid,columns}',
      public.__enlearn_add_source_target_column(schema#>'{blocks,1,schema,grid,columns}'),
      true
    ),
    '{visualEditor,pages,/,blocks,1,props,columns}',
    public.__enlearn_add_source_target_column(
      schema#>'{visualEditor,pages,/,blocks,1,props,columns}'
    ),
    true
  ),
  version = coalesce(version, 0) + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where code = 'admin-system-options'
  and (
    not exists (
      select 1
      from jsonb_array_elements(
        coalesce(schema#>'{blocks,1,schema,grid,columns}', '[]'::jsonb)
      ) column_item
      where column_item->>'field' = 'source_target'
    )
    or (
      jsonb_typeof(schema#>'{visualEditor,pages,/,blocks,1,props,columns}') = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(
          schema#>'{visualEditor,pages,/,blocks,1,props,columns}'
        ) column_item
        where column_item->>'field' = 'source_target'
      )
    )
  );

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'admin-system-options'
on conflict (page_id, version) do nothing;

drop function public.__enlearn_add_source_target_column(jsonb);

select pg_notify('pgrst', 'reload schema');
