-- Ensure incremental detail updates always carry the parent relation key.
-- This replaces the function introduced by 20260813120000 for databases where
-- that migration has already been applied.

create or replace function dynamic_crud_private.apply_detail_changes(
  p_parent jsonb,
  p_details jsonb,
  p_config jsonb,
  p_context jsonb,
  p_account_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_detail jsonb;
  v_relation_config jsonb;
  v_resource_name text;
  v_resource jsonb;
  v_foreign_key text;
  v_parent_key text;
  v_primary_key text;
  v_parent_value jsonb;
  v_inherit text;
  v_row jsonb;
  v_change jsonb;
  v_id jsonb;
  v_payload jsonb;
  v_filters jsonb;
  v_rows jsonb;
begin
  if p_details is null or pg_catalog.jsonb_typeof(p_details) <> 'array' then return; end if;

  for v_detail in select value from pg_catalog.jsonb_array_elements(p_details)
  loop
    if coalesce(nullif(v_detail->>'mode', ''), 'replace') <> 'changes' then
      continue;
    end if;

    v_resource_name := v_detail->>'resource';
    v_relation_config := p_config->'detail_relations'->v_resource_name;
    if v_relation_config is null then
      raise exception 'Detail resource % is not configured.', v_resource_name using errcode = '42501';
    end if;
    if coalesce(v_relation_config->>'update_mode', '') <> 'changes' then
      raise exception 'Detail resource % does not allow changes updates.', v_resource_name using errcode = '42501';
    end if;

    v_resource := p_config->'resources'->(v_relation_config->>'resource');
    v_foreign_key := v_relation_config->>'foreign_key';
    v_parent_key := v_relation_config->>'parent_key';
    v_primary_key := coalesce(nullif(v_resource->>'primary_key', ''), 'id');
    perform dynamic_crud_private.assert_identifier(v_foreign_key, 'detail foreignKey');
    perform dynamic_crud_private.assert_identifier(v_parent_key, 'detail parentKey');
    perform dynamic_crud_private.assert_identifier(v_primary_key, 'detail primaryKey');

    if nullif(v_detail->>'foreign_key', '') is not null
       and v_detail->>'foreign_key' <> v_foreign_key then
      raise exception 'Detail resource % foreignKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if nullif(v_detail->>'parent_key', '') is not null
       and v_detail->>'parent_key' <> v_parent_key then
      raise exception 'Detail resource % parentKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if nullif(v_detail->>'primary_key', '') is not null
       and v_detail->>'primary_key' <> v_primary_key then
      raise exception 'Detail resource % primaryKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if v_detail ? 'inherit_fields'
       and coalesce(v_detail->'inherit_fields', '[]'::jsonb) <>
           coalesce(v_relation_config->'inherit_fields', '[]'::jsonb) then
      raise exception 'Detail resource % inheritFields do not match its configuration.', v_resource_name using errcode = '42501';
    end if;

    if pg_catalog.jsonb_typeof(coalesce(v_detail->'created', '[]'::jsonb)) <> 'array'
       or pg_catalog.jsonb_typeof(coalesce(v_detail->'updated', '[]'::jsonb)) <> 'array'
       or pg_catalog.jsonb_typeof(coalesce(v_detail->'deleted', '[]'::jsonb)) <> 'array' then
      raise exception 'Detail changes must contain created, updated, and deleted arrays.' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_array_length(coalesce(v_detail->'created', '[]'::jsonb)) > 0 then
      perform dynamic_crud_private.assert_resource_config(
        v_relation_config->>'resource', v_resource, 'create', p_account_id
      );
    end if;
    if pg_catalog.jsonb_array_length(coalesce(v_detail->'updated', '[]'::jsonb)) > 0 then
      perform dynamic_crud_private.assert_resource_config(
        v_relation_config->>'resource', v_resource, 'update', p_account_id
      );
    end if;
    if pg_catalog.jsonb_array_length(coalesce(v_detail->'deleted', '[]'::jsonb)) > 0 then
      perform dynamic_crud_private.assert_resource_config(
        v_relation_config->>'resource', v_resource, 'delete', p_account_id
      );
    end if;

    if exists (
      select 1
      from (
        select value->'id' as id, 'updated'::text as operation
        from pg_catalog.jsonb_array_elements(coalesce(v_detail->'updated', '[]'::jsonb))
        union all
        select value as id, 'deleted'::text as operation
        from pg_catalog.jsonb_array_elements(coalesce(v_detail->'deleted', '[]'::jsonb))
      ) as changed_ids
      group by id
      having pg_catalog.count(*) > 1
         or pg_catalog.count(distinct operation) > 1
    ) then
      raise exception 'A detail id may appear only once across updated and deleted changes.' using errcode = '22023';
    end if;

    v_parent_value := p_parent->v_parent_key;
    if v_parent_value is null then
      raise exception 'Parent field % is required for detail resource %.', v_parent_key, v_resource_name using errcode = '22023';
    end if;
    v_filters := pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
    if nullif(v_resource->>'account_field', '') is not null then
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
    end if;
    for v_inherit in
      select value #>> '{}'
      from pg_catalog.jsonb_array_elements(coalesce(v_relation_config->'inherit_fields', '[]'::jsonb))
    loop
      if p_parent->v_inherit is null then
        raise exception 'Parent field % is required for detail resource %.', v_inherit, v_resource_name using errcode = '22023';
      end if;
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_inherit, p_parent->v_inherit);
    end loop;

    for v_row in
      select value from pg_catalog.jsonb_array_elements(coalesce(v_detail->'created', '[]'::jsonb))
    loop
      v_payload := v_row || pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
      for v_inherit in
        select value #>> '{}'
        from pg_catalog.jsonb_array_elements(coalesce(v_relation_config->'inherit_fields', '[]'::jsonb))
      loop
        v_payload := v_payload || pg_catalog.jsonb_build_object(v_inherit, p_parent->v_inherit);
      end loop;
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_payload, v_resource, 'create', p_account_id, p_context
      );
      v_payload := dynamic_crud_private.insert_row(v_resource->>'table_name', v_payload);
      perform dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterCreate', v_payload, p_context);
    end loop;

    for v_change in
      select value from pg_catalog.jsonb_array_elements(coalesce(v_detail->'updated', '[]'::jsonb))
    loop
      v_id := v_change->'id';
      if v_id is null or v_id = 'null'::jsonb or coalesce(v_id #>> '{}', '') = '' then
        raise exception 'Each updated detail row must include id.' using errcode = '22023';
      end if;
      -- The child foreign key is relation-managed, so client values are ignored.
      v_payload := coalesce(v_change->'data', '{}'::jsonb)
        || pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_payload,
        v_resource,
        'update',
        p_account_id,
        p_context,
        false
      );
      -- Relation columns can be excluded from the client update allowlist.
      v_payload := v_payload
        || pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
      v_rows := dynamic_crud_private.update_rows(
        v_resource->>'table_name',
        v_payload,
        v_filters || pg_catalog.jsonb_build_object(v_primary_key, v_id)
      );
      if pg_catalog.jsonb_array_length(v_rows) <> 1 then
        raise exception 'No detail row matched %: %.', v_primary_key, v_id #>> '{}' using errcode = 'P0002';
      end if;
      perform dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterUpdate', v_rows->0, p_context);
    end loop;

    for v_id in
      select value from pg_catalog.jsonb_array_elements(coalesce(v_detail->'deleted', '[]'::jsonb))
    loop
      if v_id is null or v_id = 'null'::jsonb or coalesce(v_id #>> '{}', '') = '' then
        raise exception 'Each deleted detail row must include id.' using errcode = '22023';
      end if;
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        '{}'::jsonb, v_resource, 'delete', p_account_id, p_context, false
      );
      if coalesce((v_resource->'delete'->>'soft_delete')::boolean, false) then
        v_payload := v_payload || pg_catalog.jsonb_build_object(
          coalesce(nullif(v_resource->'delete'->>'deleted_at_field', ''), 'deleted_at'),
          pg_catalog.to_jsonb(pg_catalog.now())
        );
        if nullif(v_resource->'delete'->>'status_field', '') is not null
           and nullif(v_resource->'delete'->>'deleted_status', '') is not null then
          v_payload := v_payload || pg_catalog.jsonb_build_object(
            v_resource->'delete'->>'status_field',
            v_resource->'delete'->>'deleted_status'
          );
        end if;
        if nullif(v_resource->'delete'->>'deleted_by_field', '') is not null
           and nullif(p_context->>'user_id', '') is not null then
          v_payload := v_payload || pg_catalog.jsonb_build_object(
            v_resource->'delete'->>'deleted_by_field',
            p_context->>'user_id'
          );
        end if;
        v_rows := dynamic_crud_private.update_rows(
          v_resource->>'table_name',
          v_payload,
          v_filters || pg_catalog.jsonb_build_object(v_primary_key, v_id)
        );
      else
        v_rows := dynamic_crud_private.delete_rows(
          v_resource->>'table_name',
          v_filters || pg_catalog.jsonb_build_object(v_primary_key, v_id)
        );
      end if;
      if pg_catalog.jsonb_array_length(v_rows) <> 1 then
        raise exception 'No detail row matched %: %.', v_primary_key, v_id #>> '{}' using errcode = 'P0002';
      end if;
      perform dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterDelete', v_rows->0, p_context);
    end loop;
  end loop;
end;
$function$;

revoke all on function dynamic_crud_private.apply_detail_changes(jsonb, jsonb, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function dynamic_crud_private.apply_detail_changes(jsonb, jsonb, jsonb, jsonb, uuid)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
