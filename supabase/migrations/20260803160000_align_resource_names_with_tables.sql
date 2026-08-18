-- Keep persisted low-code CRUD requests aligned with backend resource keys.
-- Resource names are the real database table names.

create or replace function public.__enlearn_align_resource_names_with_tables(
  value jsonb,
  inherited_service_name text default null
)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  child jsonb;
  result jsonb;
  resource_name text;
  service_name text;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(
        public.__enlearn_align_resource_names_with_tables(
          array_items.array_item,
          inherited_service_name
        )
      ),
      '[]'::jsonb
    )
      into result
    from jsonb_array_elements(value) as array_items(array_item);

    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  service_name = coalesce(value->>'serviceName', inherited_service_name);
  result = '{}'::jsonb;
  for key, child in select * from jsonb_each(value) loop
    result = result || jsonb_build_object(
      key,
      public.__enlearn_align_resource_names_with_tables(child, service_name)
    );
  end loop;

  if result ? 'resource' and jsonb_typeof(result->'resource') = 'string' then
    resource_name = case result->>'resource'
      when 'pages' then 'lowcode_pages'
      when 'pageVersions' then 'lowcode_page_versions'
      when 'roles' then 'admin_roles'
      when 'permissions' then 'admin_permissions'
      when 'routes' then 'admin_routes'
      when 'entities' then 'admin_entities'
      when 'optionSources' then 'system_option_sources'
      when 'optionItems' then 'system_option_items'
      when 'userRoles' then 'admin_user_roles'
      when 'rolePermissions' then 'admin_role_permissions'
      when 'salesOrders' then 'sales_orders'
      when 'salesOrderLines' then 'sales_order_lines'
      when 'tables' then 'entity_design_tables'
      when 'columns' then 'entity_design_columns'
      when 'relations' then 'entity_design_relations'
      when 'files' then 'file_objects'
      when 'folders' then 'file_folders'
      when 'usages' then 'file_usages'
      when 'conversations' then 'chat_conversations'
      when 'members' then 'chat_conversation_members'
      when 'allMembers' then 'chat_conversation_members'
      when 'messages' then case
        when service_name = 'chat' then 'chat_messages'
        when service_name = 'notification' then 'notification_messages'
        when result->>'operation' in ('createUploadIntent', 'createUploadUrl', 'confirmUpload', 'getDownloadUrl')
          then result->>'resource'
        else 'notification_messages'
      end
      when 'reads' then 'chat_message_reads'
      when 'preferences' then 'notification_preferences'
      when 'deliveries' then 'notification_deliveries'
      when 'events' then 'notification_events'
      when 'templates' then 'notification_templates'
      else result->>'resource'
    end;

    result = jsonb_set(result, '{resource}', to_jsonb(resource_name), true);
  end if;

  return result;
end;
$$;

update public.lowcode_pages
set
  schema = public.__enlearn_align_resource_names_with_tables(schema),
  version = coalesce(version, 0) + 1,
  updated_at = timezone('utc'::text, now())
where schema::text ~ '"resource"[[:space:]]*:[[:space:]]*"(pages|pageVersions|roles|permissions|routes|entities|optionSources|optionItems|userRoles|rolePermissions|salesOrders|salesOrderLines|tables|columns|relations|files|folders|usages|conversations|members|allMembers|messages|reads|preferences|deliveries|events|templates)"';

drop function public.__enlearn_align_resource_names_with_tables(jsonb, text);
