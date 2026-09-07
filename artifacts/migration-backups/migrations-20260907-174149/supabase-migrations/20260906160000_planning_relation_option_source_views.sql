-- Reusable, account-scoped option views for planning relation fields.

begin;

do $migration$
declare
  target record;
  view_name text;
  definition_sql text;
begin
  for target in
    select *
    from (values
      ('planning_archive_manager', '归档快照', 'coalesce(snapshot_date::text, id::text)'),
      ('planning_bucket', '时间桶', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_calendar', '日历', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_category', '主数据类别', 'coalesce(nullif(name, ''''), nullif(code, ''''), id::text)'),
      ('planning_customer', '客户', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_demand', '需求', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_forecast', '预测对象', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_item', '物料', 'coalesce(nullif(display_name, ''''), nullif(name, ''''), id::text)'),
      ('planning_location', '地点', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_operation', '工序', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_operationplan', '计划订单', 'coalesce(nullif(reference, ''''), id::text)'),
      ('planning_plan_version', '计划版本', 'coalesce(nullif(code, ''''), id::text)'),
      ('planning_resource', '资源', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_run', '排产运行', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_scenario', '计划场景', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_schedule', '排产调度', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_setupmatrix', '换型矩阵', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_skill', '技能', 'coalesce(nullif(name, ''''), id::text)'),
      ('planning_supplier', '供应商', 'coalesce(nullif(name, ''''), id::text)')
    ) as targets(table_name, title, label_expression)
  loop
    view_name := target.table_name || '_options_source';
    definition_sql := format(
      'select id, account_id, %s as label from public.%I',
      target.label_expression,
      target.table_name
    );

    execute format(
      'create or replace view public.%I with (security_invoker = true) as %s',
      view_name,
      definition_sql
    );
    execute format('grant select on public.%I to authenticated, service_role', view_name);

    insert into public.entity_design_views (
      code, schema_name, view_name, title, description, definition_sql,
      status, security_invoker, published_at, metadata
    ) values (
      view_name,
      'public',
      view_name,
      target.title || '下拉选项',
      target.title || '关联字段使用的账套隔离下拉选项视图。',
      definition_sql,
      'published',
      true,
      timezone('utc'::text, now()),
      jsonb_build_object(
        'purpose', 'relation_options',
        'source_table', target.table_name,
        'columns', jsonb_build_array(
          jsonb_build_object('name', 'id'),
          jsonb_build_object('name', 'account_id'),
          jsonb_build_object('name', 'label')
        )
      )
    )
    on conflict (code) do update set
      schema_name = excluded.schema_name,
      view_name = excluded.view_name,
      title = excluded.title,
      description = excluded.description,
      definition_sql = excluded.definition_sql,
      status = excluded.status,
      security_invoker = excluded.security_invoker,
      published_at = excluded.published_at,
      metadata = excluded.metadata,
      updated_at = timezone('utc'::text, now());

    insert into public.system_option_sources (
      code, name, description, source_type, source_config,
      cache_ttl_seconds, status, sort_order, is_system
    ) values (
      view_name,
      target.title || '选项',
      target.title || '关联字段的视图型下拉数据源。',
      'view',
      jsonb_build_object(
        'view', 'public.' || view_name,
        'labelField', 'label',
        'valueField', 'id',
        'orderBy', 'label',
        'accountScoped', true,
        'limit', 1000
      ),
      60,
      'active',
      300,
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
  end loop;
end;
$migration$;

create or replace function pg_temp.attach_planning_relation_option_sources(
  value jsonb,
  data_sources jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  result jsonb;
  source_key text;
  source_config jsonb;
  resource_name text;
  option_code text;
begin
  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(pg_temp.attach_planning_relation_option_sources(item, data_sources) order by ordinal),
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
    jsonb_object_agg(key, pg_temp.attach_planning_relation_option_sources(item, data_sources)),
    '{}'::jsonb
  )
  into result
  from jsonb_each(value) entries(key, item);

  source_key := result->>'optionsSourceKey';
  if source_key is null or source_key = '' then
    return result;
  end if;

  source_config := data_sources->source_key;
  resource_name := source_config#>>'{postData,resource}';
  option_code := resource_name || '_options_source';

  if resource_name like 'planning\_%' escape '\'
    and source_config#>>'{postData,excludeId}' is null
    and coalesce(source_config#>'{postData,filters}', '{}'::jsonb) = '{}'::jsonb
    and coalesce((source_config#>>'{postData,tree}')::boolean, false) = false
    and exists (
      select 1
      from public.system_option_sources sources
      where sources.code = option_code
        and sources.status = 'active'
    )
  then
    return (result - 'optionsSourceKey') || jsonb_build_object('optionsCode', option_code);
  end if;

  return result;
end;
$function$;

with changed_pages as (
  select
    pages.id,
    pages.schema,
    pg_temp.attach_planning_relation_option_sources(
      pages.schema,
      coalesce(pages.schema->'dataSources', '{}'::jsonb)
    ) as next_schema
  from public.lowcode_pages pages
  where pages.code like 'planning\_%' escape '\'
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
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $validation$
declare
  view_count integer;
  option_count integer;
  invalid_option_count integer;
begin
  select count(*) into view_count
  from public.entity_design_views
  where code like 'planning\_%\_options\_source' escape '\'
    and status = 'published';

  select count(*) into option_count
  from public.system_option_sources
  where code like 'planning\_%\_options\_source' escape '\'
    and source_type = 'view'
    and status = 'active';

  select count(*) into invalid_option_count
  from public.system_option_sources sources
  where sources.code like 'planning\_%\_options\_source' escape '\'
    and to_regclass(sources.source_config->>'view') is null;

  if view_count <> 19 or option_count <> 19 or invalid_option_count <> 0 then
    raise exception 'Planning relation option source validation failed: views %, options %, invalid %.',
      view_count, option_count, invalid_option_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
