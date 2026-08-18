-- Replace admin service-specific read/action methods with BaseService generic methods.

create or replace function public.__enlearn_admin_method_table_name(method_name text)
returns text
language sql
immutable
as $$
  select case method_name
    when 'listUsers' then 'profiles'
    when 'listRoles' then 'admin_roles'
    when 'listPermissions' then 'admin_permissions'
    when 'listRoutes' then 'admin_routes'
    when 'listRouteTree' then 'admin_routes'
    when 'listRouteManageTree' then 'admin_routes'
    when 'listEntities' then 'admin_entities'
    when 'listPages' then 'lowcode_pages'
    when 'listOptionSources' then 'system_option_sources'
    when 'listOptionItems' then 'system_option_items'
    when 'listSystemExecutionTasks' then 'wf_job'
    when 'listWorkflowJobs' then 'wf_job'
    when 'listWorkflowJobRuns' then 'wf_job_run'
    when 'listWorkflowTimerJobs' then 'wf_timer_job'
    when 'routeTree' then 'admin_routes'
    when 'routeManageTree' then 'admin_routes'
    when 'optionSources' then 'system_option_sources'
    when 'optionItems' then 'system_option_items'
    when 'dropdownOptions' then 'system_option_items'
    when 'systemExecutionTasks' then 'wf_job'
    when 'workflowJobs' then 'wf_job'
    when 'workflowJobRuns' then 'wf_job_run'
    when 'workflowTimerJobs' then 'wf_timer_job'
    when 'userItems' then 'profiles'
    when 'lowCodePageItems' then 'lowcode_pages'
    else null
  end;
$$;

create or replace function public.__enlearn_normalize_admin_execute_actions(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  child jsonb;
  result jsonb;
  table_name text;
  old_post_data jsonb;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(public.__enlearn_normalize_admin_execute_actions(array_items.item)),
      '[]'::jsonb
    )
      into result
    from jsonb_array_elements(value) as array_items(item);

    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  result = '{}'::jsonb;
  for key, child in select * from jsonb_each(value) loop
    result = result || jsonb_build_object(key, public.__enlearn_normalize_admin_execute_actions(child));
  end loop;

  table_name = public.__enlearn_admin_method_table_name(result->>'serviceMethod');
  if (result->>'serviceName') = 'admin' and table_name is not null then
    old_post_data = coalesce(result->'postData', '{}'::jsonb);
    result = jsonb_set(result, '{serviceMethod}', to_jsonb('listItems'::text), true);
    result = jsonb_set(
      result,
      '{postData}',
      case
        when jsonb_typeof(old_post_data) = 'object'
          then (old_post_data - 'entityCode' - 'entity_code') || jsonb_build_object('tableName', table_name)
        else jsonb_build_object('tableName', table_name)
      end,
      true
    );
  end if;

  if (result->>'serviceName') = 'admin' and (result->>'serviceMethod') = 'hideRoute' then
    old_post_data = result->'postData';
    result = jsonb_set(result, '{serviceMethod}', to_jsonb('updateItem'::text), true);
    result = jsonb_set(
      result,
      '{postData}',
      case
        when old_post_data is null then jsonb_build_object('resource', 'routes', 'visible', false)
        when jsonb_typeof(old_post_data) = 'object'
          then old_post_data || jsonb_build_object('resource', 'routes', 'visible', false)
        else jsonb_build_object('resource', 'routes', 'visible', false, 'data', old_post_data)
      end,
      true
    );
  end if;

  return result;
end;
$$;

update public.lowcode_pages
set
  schema = public.__enlearn_normalize_admin_execute_actions(schema),
  version = coalesce(version, 0) + 1,
  updated_at = timezone('utc'::text, now())
where schema::text ~ 'listUsers|listRoles|listPermissions|listRoutes|listRouteTree|listRouteManageTree|listEntities|listPages|listOptionSources|listOptionItems|listSystemExecutionTasks|listWorkflowJobs|listWorkflowJobRuns|listWorkflowTimerJobs|routeTree|routeManageTree|optionSources|optionItems|dropdownOptions|systemExecutionTasks|workflowJobs|workflowJobRuns|workflowTimerJobs|userItems|lowCodePageItems|hideRoute';

drop function public.__enlearn_normalize_admin_execute_actions(jsonb);
drop function public.__enlearn_admin_method_table_name(text);
