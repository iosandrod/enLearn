-- Remove admin CRUD method aliases from persisted low-code schemas.
-- Business pages should call the generic BaseService CRUD methods directly:
-- saveItem/deleteItem with postData.resource.

create or replace function public.__enlearn_replace_admin_crud_aliases(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  child jsonb;
  result jsonb;
  resource_name text;
  next_method text;
  old_post_data jsonb;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(public.__enlearn_replace_admin_crud_aliases(item)), '[]'::jsonb)
      into result
    from jsonb_array_elements(value) as array_items(item);

    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  result = '{}'::jsonb;
  for key, child in select * from jsonb_each(value) loop
    result = result || jsonb_build_object(key, public.__enlearn_replace_admin_crud_aliases(child));
  end loop;

  resource_name = case result->>'saveMethod'
    when 'saveRole' then 'roles'
    when 'savePermission' then 'permissions'
    when 'saveRoute' then 'routes'
    when 'saveEntity' then 'entities'
    when 'saveOptionSource' then 'optionSources'
    when 'saveOptionItem' then 'optionItems'
    else null
  end;

  if resource_name is not null then
    result = jsonb_set(result, '{saveMethod}', to_jsonb('saveItem'::text), true);
    old_post_data = coalesce(result->'postData', '{}'::jsonb);
    result = jsonb_set(
      result,
      '{postData}',
      case
        when jsonb_typeof(old_post_data) = 'object'
          then old_post_data || jsonb_build_object('resource', resource_name)
        else jsonb_build_object('resource', resource_name)
      end,
      true
    );
  end if;

  resource_name = case result->>'deleteMethod'
    when 'deleteRole' then 'roles'
    when 'deletePermission' then 'permissions'
    when 'deleteRoute' then 'routes'
    when 'deleteEntity' then 'entities'
    when 'deleteOptionSource' then 'optionSources'
    when 'deleteOptionItem' then 'optionItems'
    else null
  end;

  if resource_name is not null then
    result = jsonb_set(result, '{deleteMethod}', to_jsonb('deleteItem'::text), true);
    old_post_data = coalesce(result->'postData', '{}'::jsonb);
    result = jsonb_set(
      result,
      '{postData}',
      case
        when jsonb_typeof(old_post_data) = 'object'
          then old_post_data || jsonb_build_object('resource', resource_name)
        else jsonb_build_object('resource', resource_name)
      end,
      true
    );
  end if;

  resource_name = case result->>'serviceMethod'
    when 'saveRole' then 'roles'
    when 'savePermission' then 'permissions'
    when 'saveRoute' then 'routes'
    when 'saveEntity' then 'entities'
    when 'saveOptionSource' then 'optionSources'
    when 'saveOptionItem' then 'optionItems'
    when 'deleteRole' then 'roles'
    when 'deletePermission' then 'permissions'
    when 'deleteRoute' then 'routes'
    when 'deleteEntity' then 'entities'
    when 'deleteOptionSource' then 'optionSources'
    when 'deleteOptionItem' then 'optionItems'
    else null
  end;

  if resource_name is not null then
    next_method = case
      when (result->>'serviceMethod') like 'delete%' then 'deleteItem'
      else 'saveItem'
    end;
    old_post_data = result->'postData';

    result = jsonb_set(result, '{serviceMethod}', to_jsonb(next_method), true);
    result = jsonb_set(
      result,
      '{postData}',
      case
        when old_post_data is null then jsonb_build_object('resource', resource_name)
        when jsonb_typeof(old_post_data) = 'object'
          then old_post_data || jsonb_build_object('resource', resource_name)
        else jsonb_build_object('resource', resource_name, 'data', old_post_data)
      end,
      true
    );
  end if;

  return result;
end;
$$;

update public.lowcode_pages
set
  schema = public.__enlearn_replace_admin_crud_aliases(schema),
  version = coalesce(version, 0) + 1,
  updated_at = timezone('utc'::text, now())
where schema::text ~ 'saveRole|deleteRole|savePermission|deletePermission|saveRoute|deleteRoute|saveEntity|deleteEntity|saveOptionSource|deleteOptionSource|saveOptionItem|deleteOptionItem';

drop function public.__enlearn_replace_admin_crud_aliases(jsonb);
