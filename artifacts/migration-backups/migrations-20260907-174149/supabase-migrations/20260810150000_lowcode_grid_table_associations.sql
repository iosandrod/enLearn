-- Associate every resolvable low-code Grid with its bare public physical-table name.

begin;

-- The designer dropdown stores and displays bare names for the public schema.
create or replace view public.system_physical_table_options
with (security_invoker = true)
as
select
  tables.table_name::text as value,
  tables.table_name::text as label
from information_schema.tables tables
where tables.table_schema = 'public'
  and tables.table_type = 'BASE TABLE';

grant select on public.system_physical_table_options to authenticated;

create or replace function pg_temp.lowcode_bare_physical_table(p_name text)
returns text
language plpgsql
stable
as $function$
declare
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_schema_name text;
  v_table_name text;
  v_resolved_name text;
begin
  if v_name is null or v_name !~ '^(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*$' then
    return null;
  end if;

  if pg_catalog.strpos(v_name, '.') > 0 then
    v_schema_name := pg_catalog.split_part(v_name, '.', 1);
    v_table_name := pg_catalog.split_part(v_name, '.', 2);
  else
    v_schema_name := 'public';
    v_table_name := v_name;
  end if;

  if v_schema_name <> 'public' then
    return null;
  end if;

  select relation.relname
  into v_resolved_name
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = v_schema_name
    and relation.relname = v_table_name
    and relation.relkind in ('r', 'p', 'f')
  limit 1;

  return v_resolved_name;
end;
$function$;

create or replace function pg_temp.lowcode_link_grid_tables(
  p_document jsonb,
  p_page_code text,
  p_data_sources jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_source_key text;
  v_source jsonb;
  v_post_data jsonb;
  v_service_name text;
  v_service_method text;
  v_entity_code text;
  v_resource_name text;
  v_entity_table text;
  v_resource_table text;
  v_workflow_table text;
  v_planning_table text;
  v_service_table text;
  v_override_table text;
  v_direct_target text;
  v_table_name text;
  v_source_type text;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document->>'kind' = 'grid' then
        v_source_key := nullif(pg_catalog.btrim(coalesce(
          p_document->>'sourceKey',
          p_document->'props'->>'sourceKey'
        )), '');
        v_source := case
          when v_source_key is not null
            and jsonb_typeof(p_data_sources->v_source_key) = 'object'
          then p_data_sources->v_source_key
          else '{}'::jsonb
        end;
        v_post_data := case
          when jsonb_typeof(v_source->'postData') = 'object' then v_source->'postData'
          when jsonb_typeof(v_source->'post_data') = 'object' then v_source->'post_data'
          else '{}'::jsonb
        end;
        if jsonb_typeof(v_source->'postData') = 'string' then
          begin
            v_post_data := (v_source->>'postData')::jsonb;
          exception when others then
            v_post_data := '{}'::jsonb;
          end;
        end if;

        v_service_name := nullif(pg_catalog.btrim(v_source->>'serviceName'), '');
        v_service_method := nullif(pg_catalog.btrim(v_source->>'serviceMethod'), '');
        v_entity_code := nullif(pg_catalog.btrim(coalesce(
          v_source->>'entityCode',
          v_source->>'entity_code',
          v_post_data->>'entityCode',
          v_post_data->>'entity_code'
        )), '');
        v_resource_name := nullif(pg_catalog.btrim(coalesce(
          v_post_data->>'resource',
          v_source->>'resource'
        )), '');

        select entity.table_name
        into v_entity_table
        from public.admin_entities entity
        where entity.code = v_entity_code
        limit 1;

        select registry.table_name
        into v_resource_table
        from public.dynamic_crud_resource_registry registry
        where registry.resource_name = v_resource_name
        limit 1;

        select mapping.table_name
        into v_workflow_table
        from (values
          ('models', 'wf_model'),
      ('instances', 'wf_process_instance'),
      ('nodeInstances', 'wf_node_instance'),
      ('tasks', 'wf_task')
        ) as mapping(item_type, table_name)
        where v_service_name = 'workflow'
          and v_service_method = 'listItems'
          and mapping.item_type = coalesce(
            v_post_data->>'itemType',
            v_post_data->>'item_type',
            v_post_data->>'type'
          )
        limit 1;

        select mapping.table_name
        into v_planning_table
        from (values
          ('demands', 'planning_demand'),
      ('operationPlans', 'planning_operationplan'),
      ('materials', 'planning_operationplanmaterial'),
      ('planResources', 'planning_operationplanresource'),
      ('resourcePlans', 'planning_resourceplan'),
      ('problems', 'planning_problem'),
      ('constraints', 'planning_constraint'),
      ('runs', 'planning_run')
        ) as mapping(dataset, table_name)
        where v_service_name = 'planning'
          and v_service_method = 'getPlanningConsoleData'
          and mapping.dataset = v_post_data->>'dataset'
        limit 1;

        select mapping.table_name
        into v_service_table
        from (values
          ('admin', 'listUsers', 'users'),
      ('admin', 'getUser', 'users'),
      ('admin', 'listRoles', 'admin_roles'),
      ('admin', 'getRole', 'admin_roles'),
      ('admin', 'listPermissions', 'admin_permissions'),
      ('admin', 'listRoutes', 'admin_routes'),
      ('admin', 'listRouteTree', 'admin_routes'),
      ('admin', 'listRouteManageTree', 'admin_routes'),
      ('admin', 'listEntities', 'admin_entities'),
      ('admin', 'listPages', 'lowcode_pages'),
      ('admin', 'listOptionSources', 'system_option_sources'),
      ('admin', 'listOptionItems', 'system_option_items'),
      ('admin', 'listSystemExecutionTasks', 'wf_job'),
      ('admin', 'listWorkflowJobs', 'wf_job'),
      ('admin', 'listWorkflowJobRuns', 'wf_job_run'),
      ('admin', 'listWorkflowTimerJobs', 'wf_timer_job'),
      ('lowcode', 'listPages', 'lowcode_pages'),
      ('notification', 'listDeliveries', 'notification_deliveries'),
      ('notification', 'listMessages', 'notification_messages'),
      ('notification', 'getPreferences', 'notification_preferences'),
      ('entityDesign', 'listViews', 'entity_design_views')
        ) as mapping(service_name, service_method, table_name)
        where mapping.service_name = v_service_name
          and mapping.service_method = v_service_method
        limit 1;

        select mapping.table_name
        into v_override_table
        from (values
          ('admin-system-entities::entity-grid-permissions-grid', 'admin_permissions'),
      ('admin-system-entities::entity-grid-routes-grid', 'admin_routes'),
      ('admin-system-permissions::permission-grid-roles-grid', 'admin_roles'),
      ('admin-system-roles::role-grid-permissions-grid', 'admin_permissions'),
      ('admin-system-routes::route-tree-grid-children-grid', 'admin_routes'),
      ('admin-system-users::user-role-permission-grid', 'users'),
      ('role-management-list::role-list-grid-permissions-grid', 'admin_permissions'),
      ('visual-admin-page::records-grid-fields-grid', 'users'),
      ('visual-admin-query-flow-20260724-0932::records-grid-fields-grid', 'users'),
      ('visual-admin-query-flow-20260724-style2::records-grid-fields-grid', 'users'),
      ('visual-admin-query-flow-20260724-style3::records-grid-fields-grid', 'users')
        ) as mapping(association_key, table_name)
        where mapping.association_key = p_page_code || '::' || coalesce(p_document->>'id', '')
        limit 1;

        select candidate.resolved_name
        into v_table_name
        from (values
          (1, p_document->>'tableName'),
          (2, p_document->>'table_name'),
          (3, p_document->'props'->>'tableName'),
          (4, p_document->'props'->>'table_name'),
          (5, v_source->>'tableName'),
          (6, v_source->>'table_name'),
          (7, v_post_data->>'tableName'),
          (8, v_post_data->>'table_name'),
          (9, v_entity_table),
          (10, v_entity_code),
          (11, v_resource_table),
          (12, v_resource_name),
          (13, v_workflow_table),
          (14, v_planning_table),
          (15, v_service_table),
          (16, v_override_table)
        ) as names(priority, candidate_name)
        cross join lateral (
          select pg_temp.lowcode_bare_physical_table(names.candidate_name) as resolved_name
        ) candidate
        where candidate.resolved_name is not null
        order by names.priority
        limit 1;

        if v_table_name is null then
          return p_document;
        end if;

        v_direct_target := coalesce(
          v_source->>'tableName',
          v_source->>'table_name',
          v_post_data->>'tableName',
          v_post_data->>'table_name',
          v_entity_table,
          v_entity_code,
          v_resource_table,
          v_resource_name
        );
        v_source_type := case
          when coalesce(
            nullif(pg_catalog.btrim(p_document->>'sourceType'), ''),
            nullif(pg_catalog.btrim(v_source->>'sourceType'), '')
          ) in ('custom', 'table', 'view')
          then coalesce(
            nullif(pg_catalog.btrim(p_document->>'sourceType'), ''),
            nullif(pg_catalog.btrim(v_source->>'sourceType'), '')
          )
          when pg_temp.lowcode_bare_physical_table(v_direct_target) is not null then 'table'
          else 'custom'
        end;

        return jsonb_set(
          jsonb_set(p_document - 'table_name', '{sourceType}', to_jsonb(v_source_type), true),
          '{tableName}',
          to_jsonb(v_table_name),
          true
        );
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.lowcode_link_grid_tables(entry.value, p_page_code, p_data_sources)
      )
      into v_result
      from jsonb_each(p_document) entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.lowcode_link_grid_tables(item.value, p_page_code, p_data_sources)
        order by item.ordinality
      )
      into v_result
      from jsonb_array_elements(p_document) with ordinality item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

do $migration$
declare
  v_page record;
  v_next_schema jsonb;
  v_next_version integer;
  v_changed_at timestamptz;
  v_next_published_at timestamptz;
begin
  for v_page in
    select id, code, schema, version, published_at
    from public.lowcode_pages
    order by code
    for update
  loop
    v_next_schema := pg_temp.lowcode_link_grid_tables(
      v_page.schema,
      v_page.code,
      coalesce(v_page.schema->'dataSources', '{}'::jsonb)
    );

    if v_next_schema is not distinct from v_page.schema then
      continue;
    end if;

    v_next_version := coalesce(v_page.version, 0) + 1;
    v_changed_at := timezone('utc'::text, now());
    v_next_published_at := case
      when v_page.published_at is not null then v_changed_at
      else null
    end;

    update public.lowcode_pages
    set schema = v_next_schema,
        version = v_next_version,
        published_at = v_next_published_at,
        updated_at = v_changed_at
    where id = v_page.id;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    values (
      v_page.id,
      v_next_version,
      v_next_schema,
      v_next_published_at
    )
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
