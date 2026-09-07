-- Align notification low-code pages with the unified BaseService CRUD methods.

create or replace function pg_temp.enlearn_unify_notification_crud(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
  item jsonb;
  key text;
  method text;
  post_data jsonb;
  filters jsonb;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      result := result || jsonb_build_array(pg_temp.enlearn_unify_notification_crud(item));
    end loop;
    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  result := '{}'::jsonb;
  for key, item in select * from jsonb_each(value) loop
    result := result || jsonb_build_object(key, pg_temp.enlearn_unify_notification_crud(item));
  end loop;

  if result->>'serviceName' <> 'notification' then
    return result;
  end if;

  method := result->>'serviceMethod';
  post_data := coalesce(result->'postData', '{}'::jsonb);
  filters := case
    when jsonb_typeof(coalesce(post_data->'filters', '{}'::jsonb)) = 'object'
      then coalesce(post_data->'filters', '{}'::jsonb)
    else '{}'::jsonb
  end;

  if method = 'listMessages' then
    post_data := post_data || jsonb_build_object(
      'tableName', 'notification_messages',
      'pageSize', coalesce(post_data->'pageSize', post_data->'page_size', post_data->'limit', '100'::jsonb),
      'filters', filters || jsonb_build_object('archived_at', jsonb_build_object('op', 'isNull')),
      'sorts', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'desc'))
    );

    return result || jsonb_build_object('serviceMethod', 'listItems', 'postData', post_data);
  end if;

  if method = 'getPreferences' then
    post_data := post_data || jsonb_build_object(
      'tableName', 'notification_preferences',
      'pageSize', coalesce(post_data->'pageSize', post_data->'page_size', post_data->'limit', '100'::jsonb),
      'sorts', jsonb_build_array(jsonb_build_object('field', 'category', 'direction', 'asc'))
    );

    return result || jsonb_build_object('serviceMethod', 'listItems', 'postData', post_data);
  end if;

  if method = 'listDeliveries' then
    post_data := post_data || jsonb_build_object(
      'tableName', 'notification_deliveries',
      'pageSize', coalesce(post_data->'pageSize', post_data->'page_size', post_data->'limit', '100'::jsonb),
      'filters', filters || jsonb_build_object('tenant_id', coalesce(post_data->'tenant_id', post_data->'tenantId', '"default"'::jsonb)),
      'sorts', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'desc'))
    );

    return result || jsonb_build_object('serviceMethod', 'listItems', 'postData', post_data);
  end if;

  if method = 'markRead' then
    post_data := post_data || jsonb_build_object('resource', 'messages', 'markRead', true);
    return result || jsonb_build_object('serviceMethod', 'updateItem', 'postData', post_data);
  end if;

  if method = 'markAllRead' then
    filters := filters || jsonb_build_object(
      'read_at', jsonb_build_object('op', 'isNull'),
      'archived_at', jsonb_build_object('op', 'isNull')
    );

    if post_data ? 'category' then
      filters := filters || jsonb_build_object('category', post_data->'category');
      post_data := post_data - 'category';
    end if;

    post_data := post_data || jsonb_build_object(
      'resource', 'messages',
      'filters', filters,
      'markRead', true
    );

    return result || jsonb_build_object('serviceMethod', 'updateItem', 'postData', post_data);
  end if;

  if method = 'archiveMessage' then
    post_data := post_data || jsonb_build_object('resource', 'messages', 'archive', true);
    return result || jsonb_build_object('serviceMethod', 'updateItem', 'postData', post_data);
  end if;

  if method = 'retryDelivery' then
    post_data := post_data || jsonb_build_object('resource', 'deliveries', 'retry', true);
    return result || jsonb_build_object('serviceMethod', 'updateItem', 'postData', post_data);
  end if;

  return result;
end;
$$;

update public.lowcode_pages
set
  schema = pg_temp.enlearn_unify_notification_crud(schema),
  version = version + 1,
  updated_at = timezone('utc'::text, now())
where code in ('notification-message-center', 'notification-deliveries');

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('notification-message-center', 'notification-deliveries')
on conflict (page_id, version) do nothing;
