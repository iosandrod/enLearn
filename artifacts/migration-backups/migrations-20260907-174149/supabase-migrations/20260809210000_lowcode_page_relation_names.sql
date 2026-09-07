-- Store the primary database relation associated with each low-code page.

alter table public.lowcode_pages
  add column if not exists view_name text,
  add column if not exists table_name text;

comment on column public.lowcode_pages.view_name is
  'Schema-qualified primary database view associated with the page.';
comment on column public.lowcode_pages.table_name is
  'Schema-qualified primary physical table associated with the page.';

create index if not exists lowcode_pages_view_name_idx
  on public.lowcode_pages(view_name)
  where view_name is not null;

create index if not exists lowcode_pages_table_name_idx
  on public.lowcode_pages(table_name)
  where table_name is not null;

with recursive block_walk as (
  select
    page.id as page_id,
    page.page_type,
    entry.value as block,
    array[entry.ordinality::integer] as block_path
  from public.lowcode_pages page
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(page.schema->'blocks', '[]'::jsonb)
  ) with ordinality as entry(value, ordinality)

  union all

  select
    parent.page_id,
    parent.page_type,
    child.value,
    parent.block_path || child.position
  from block_walk parent
  cross join lateral (
    select
      entry.value,
      entry.ordinality::integer as position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(parent.block->'blocks') = 'array'
          then parent.block->'blocks'
        else '[]'::jsonb
      end
    ) with ordinality as entry(value, ordinality)

    union all

    select
      entry.value,
      (1000 + tab.ordinality * 100 + entry.ordinality)::integer as position
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(parent.block->'tabs') = 'array'
          then parent.block->'tabs'
        else '[]'::jsonb
      end
    ) with ordinality as tab(value, ordinality)
    cross join lateral pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(tab.value->'blocks') = 'array'
          then tab.value->'blocks'
        else '[]'::jsonb
      end
    ) with ordinality as entry(value, ordinality)
  ) child
), main_sources as (
  select distinct on (page_id)
    page_id,
    coalesce(block->>'sourceKey', block->'props'->>'sourceKey') as source_key
  from block_walk
  where block->>'kind' in ('form', 'grid', 'detail')
    and nullif(
      pg_catalog.btrim(coalesce(block->>'sourceKey', block->'props'->>'sourceKey')),
      ''
    ) is not null
  order by
    page_id,
    case
      when block->>'tableType' = 'main' then 0
      when page_type in ('edit', 'detail') and block->>'kind' = 'form' then 1
      when page_type not in ('edit', 'detail') and block->>'kind' = 'grid' then 1
      else 2
    end,
    block_path
), raw_sources as (
  select
    page.id as page_id,
    page.page_type,
    source.key as source_key,
    source.value,
    nullif(pg_catalog.btrim(coalesce(
      source.value->>'sourceType',
      source.value->>'source_type'
    )), '') as source_type,
    nullif(pg_catalog.btrim(coalesce(
      source.value->>'viewName',
      source.value->>'view_name',
      source.value->'postData'->>'viewName',
      source.value->'postData'->>'view_name'
    )), '') as explicit_view_name,
    nullif(pg_catalog.btrim(coalesce(
      source.value->>'tableName',
      source.value->>'table_name',
      source.value->'postData'->>'tableName',
      source.value->'postData'->>'table_name'
    )), '') as explicit_table_name,
    nullif(pg_catalog.btrim(coalesce(
      source.value->>'entityCode',
      source.value->>'entity_code',
      source.value->'postData'->>'entityCode',
      source.value->'postData'->>'entity_code'
    )), '') as entity_code,
    nullif(pg_catalog.btrim(coalesce(
      source.value->'postData'->>'resource',
      source.value->>'resource'
    )), '') as resource_name,
    nullif(pg_catalog.btrim(source.value->>'serviceName'), '') as service_name,
    nullif(pg_catalog.btrim(source.value->>'serviceMethod'), '') as service_method,
    nullif(pg_catalog.btrim(source.value->>'saveMethod'), '') as save_method
  from public.lowcode_pages page
  cross join lateral pg_catalog.jsonb_each(
    coalesce(page.schema->'dataSources', '{}'::jsonb)
  ) source
), mapped_sources as (
  select
    source.*,
    case
      when source.service_name = 'workflow' and source.service_method = 'listItems' then
        case coalesce(
          source.value->'postData'->>'itemType',
          source.value->'postData'->>'item_type'
        )
          when 'models' then 'public.wf_model'
          when 'instances' then 'public.wf_process_instance'
          when 'nodeInstances' then 'public.wf_node_instance'
          when 'tasks' then 'public.wf_task'
          else null
        end
      else
        case source.service_method
          when 'listUsers' then 'public.users'
          when 'getUser' then 'public.users'
          when 'listRoles' then 'public.admin_roles'
          when 'getRole' then 'public.admin_roles'
          when 'listPermissions' then 'public.admin_permissions'
          when 'listRoutes' then 'public.admin_routes'
          when 'listRouteTree' then 'public.admin_routes'
          when 'listRouteManageTree' then 'public.admin_routes'
          when 'listEntities' then 'public.admin_entities'
          when 'listPages' then 'public.lowcode_pages'
          when 'listSystemExecutionTasks' then 'public.wf_job'
          when 'listWorkflowJobs' then 'public.wf_job'
          when 'listWorkflowJobRuns' then 'public.wf_job_run'
          when 'listWorkflowTimerJobs' then 'public.wf_timer_job'
          when 'listDeliveries' then 'public.notification_deliveries'
          when 'listMessages' then 'public.notification_messages'
          when 'getPreferences' then 'public.notification_preferences'
          when 'listViews' then 'public.entity_design_views'
          else null
        end
    end as mapped_relation_name
  from raw_sources source
), source_candidates as (
  select
    source.page_id,
    target.relation_name,
    case
      when target.target_kind = 'view' then 'view'
      else source.source_type
    end as requested_kind,
    (
      case
        when main_source.source_key = source.source_key then 0
        when source.page_type in ('edit', 'detail') and source.save_method is not null then 10
        when source.service_method = 'listItems' and source.source_key ilike '%rows' then 20
        else 50
      end + target.target_rank
    ) as candidate_rank
  from mapped_sources source
  left join main_sources main_source on main_source.page_id = source.page_id
  cross join lateral (
    values
      (source.explicit_view_name, 'view'::text, 0),
      (source.explicit_table_name, 'table'::text, 1),
      (source.entity_code, 'table'::text, 2),
      (source.resource_name, 'table'::text, 3),
      (source.mapped_relation_name, 'table'::text, 4)
  ) as target(relation_name, target_kind, target_rank)
  where target.relation_name is not null
    and (
      target.target_rank = 4
      or source.source_type in ('table', 'view')
      or source.service_method = 'listItems'
    )
), entity_candidates as (
  select
    page.id as page_id,
    entity.table_name as relation_name,
    null::text as requested_kind,
    -100 as candidate_rank
  from public.lowcode_pages page
  join public.admin_entities entity
    on entity.page_code = page.code
   and entity.route_path = page.route
), all_candidates as (
  select * from entity_candidates
  union all
  select * from source_candidates
), parsed_candidates as (
  select
    candidate.*,
    case
      when pg_catalog.strpos(candidate.relation_name, '.') > 0
        then pg_catalog.split_part(candidate.relation_name, '.', 1)
      else 'public'
    end as schema_name,
    case
      when pg_catalog.strpos(candidate.relation_name, '.') > 0
        then pg_catalog.split_part(candidate.relation_name, '.', 2)
      else candidate.relation_name
    end as local_name
  from all_candidates candidate
  where candidate.relation_name ~ '^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$'
), resolved_candidates as (
  select
    candidate.page_id,
    namespace.nspname || '.' || relation.relname as relation_name,
    relation.relkind,
    candidate.candidate_rank
  from parsed_candidates candidate
  join pg_catalog.pg_namespace namespace
    on namespace.nspname = candidate.schema_name
  join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = candidate.local_name
   and relation.relkind in ('r', 'p', 'v', 'm', 'f')
), picked_relations as (
  select distinct on (page_id)
    page_id,
    case when relkind in ('v', 'm') then relation_name end as view_name,
    case when relkind not in ('v', 'm') then relation_name end as table_name
  from resolved_candidates
  order by page_id, candidate_rank, relation_name
)
update public.lowcode_pages page
set
  view_name = relation.view_name,
  table_name = relation.table_name
from picked_relations relation
where relation.page_id = page.id
  and (
    page.view_name is distinct from relation.view_name
    or page.table_name is distinct from relation.table_name
  );

-- An edit/detail page describes the same primary relation as its linked list page.
update public.lowcode_pages child
set
  view_name = parent.view_name,
  table_name = parent.table_name
from public.lowcode_pages parent
where parent.edit_page_id = child.id
  and (parent.view_name is not null or parent.table_name is not null)
  and (
    child.view_name is distinct from parent.view_name
    or child.table_name is distinct from parent.table_name
  );

create or replace function public.__enlearn_add_page_relation_columns(columns jsonb)
returns jsonb
language sql
immutable
as $function$
  with existing_columns as (
    select item, ordinal * 10 as position
    from pg_catalog.jsonb_array_elements(columns) with ordinality entries(item, ordinal)
    where item->>'field' not in ('view_name', 'table_name')
  ), route_column as (
    select position
    from existing_columns
    where item->>'field' = 'route'
    limit 1
  ), combined_columns as (
    select item, position from existing_columns
    union all
    select pg_catalog.jsonb_build_object(
      'field', 'view_name',
      'title', U&'\5173\8054\89C6\56FE\540D',
      'minWidth', 220,
      'showOverflow', 'tooltip',
      'formatter', pg_catalog.jsonb_build_object('type', 'text', 'emptyText', '-')
    ), coalesce((select position + 1 from route_column), 100001)
    union all
    select pg_catalog.jsonb_build_object(
      'field', 'table_name',
      'title', U&'\5173\8054\8868\540D',
      'minWidth', 220,
      'showOverflow', 'tooltip',
      'formatter', pg_catalog.jsonb_build_object('type', 'text', 'emptyText', '-')
    ), coalesce((select position + 2 from route_column), 100002)
  )
  select case
    when pg_catalog.jsonb_typeof(columns) <> 'array' then columns
    else coalesce(
      pg_catalog.jsonb_agg(item order by position),
      '[]'::jsonb
    )
  end
  from combined_columns
$function$;

create or replace function public.__enlearn_add_page_relation_grid_columns(blocks jsonb)
returns jsonb
language sql
immutable
as $function$
  select case
    when pg_catalog.jsonb_typeof(blocks) <> 'array' then blocks
    else coalesce(
      pg_catalog.jsonb_agg(
        case
          when block->>'id' = 'lowcode-page-main-grid'
            and pg_catalog.jsonb_typeof(block#>'{schema,grid,columns}') = 'array'
          then pg_catalog.jsonb_set(
            block,
            '{schema,grid,columns}',
            public.__enlearn_add_page_relation_columns(block#>'{schema,grid,columns}'),
            false
          )
          else block
        end
        order by ordinal
      ),
      '[]'::jsonb
    )
  end
  from pg_catalog.jsonb_array_elements(blocks) with ordinality entries(block, ordinal)
$function$;

with updated_schema as (
  select
    id,
    pg_catalog.jsonb_set(
      schema,
      '{blocks}',
      public.__enlearn_add_page_relation_grid_columns(schema->'blocks'),
      false
    ) as schema
  from public.lowcode_pages
  where code = 'lowcode-pages'
)
update public.lowcode_pages page
set
  schema = updated_schema.schema,
  version = page.version + 1,
  published_at = case
    when page.status = 'published' then pg_catalog.timezone('utc'::text, now())
    else page.published_at
  end,
  updated_at = pg_catalog.timezone('utc'::text, now())
from updated_schema
where updated_schema.id = page.id
  and updated_schema.schema is distinct from page.schema;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'lowcode-pages'
on conflict (page_id, version) do nothing;

drop function public.__enlearn_add_page_relation_grid_columns(jsonb);
drop function public.__enlearn_add_page_relation_columns(jsonb);

select pg_catalog.pg_notify('pgrst', 'reload schema');
