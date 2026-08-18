-- Repair the dynamic-route edit page so a row selected on the list page is
-- loaded into the form, and keep the visual designer source settings aligned.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_runtime_blocks jsonb;
  v_visual_blocks jsonb;
  v_record_source jsonb := $json$
  {
    "key": "record",
    "label": "编辑信息",
    "sourceType": "table",
    "serviceName": "admin",
    "serviceMethod": "listItems",
    "saveMethod": "saveItem",
    "tableName": "admin_routes",
    "postData": {
      "resource": "admin_routes",
      "tableName": "admin_routes",
      "filters": { "id": "{{ route.query.id }}" },
      "requiredFilters": ["id"],
      "limit": 1
    },
    "autoLoad": true
  }
  $json$::jsonb;
  v_visual_source_props jsonb := $json$
  {
    "sourceKey": "record",
    "submitSourceKey": "record",
    "serviceName": "admin",
    "serviceMethod": "listItems",
    "saveMethod": "saveItem",
    "entityCode": "admin_routes",
    "tableName": "admin_routes",
    "postDataJson": {
      "resource": "admin_routes",
      "tableName": "admin_routes",
      "filters": { "id": "{{ route.query.id }}" },
      "requiredFilters": ["id"],
      "limit": 1
    }
  }
  $json$::jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'admin-system-routes-edit'
  for update;

  if v_page_id is null then
    raise notice 'admin-system-routes-edit does not exist; skipping repair';
    return;
  end if;

  v_next_schema := jsonb_set(
    v_schema,
    '{dataSources,record}',
    v_record_source,
    true
  );

  select jsonb_agg(
    case
      when block->>'kind' = 'form'
        and (
          block->>'sourceKey' = 'record'
          or block->>'id' = 'edit-form-955036'
        )
      then block || jsonb_build_object(
        'sourceKey', 'record',
        'submitSourceKey', 'record'
      )
      else block
    end
    order by ordinal
  )
  into v_runtime_blocks
  from jsonb_array_elements(coalesce(v_next_schema->'blocks', '[]'::jsonb))
    with ordinality as runtime_block(block, ordinal);

  v_next_schema := jsonb_set(
    v_next_schema,
    '{blocks}',
    coalesce(v_runtime_blocks, '[]'::jsonb),
    true
  );

  if jsonb_typeof(v_next_schema #> '{visualEditor,pages,/,blocks}') = 'array' then
    select jsonb_agg(
      case
        when block->>'componentKey' in ('form', 'lowcode-edit-form')
          and (
            block #>> '{props,sourceKey}' = 'record'
            or block #>> '{props,blockId}' = 'edit-form-955036'
          )
        then jsonb_set(
          block,
          '{props}',
          coalesce(block->'props', '{}'::jsonb) || v_visual_source_props,
          true
        )
        else block
      end
      order by ordinal
    )
    into v_visual_blocks
    from jsonb_array_elements(v_next_schema #> '{visualEditor,pages,/,blocks}')
      with ordinality as visual_block(block, ordinal);

    v_next_schema := jsonb_set(
      v_next_schema,
      '{visualEditor,pages,/,blocks}',
      coalesce(v_visual_blocks, '[]'::jsonb),
      true
    );
  end if;

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      page_type = 'edit',
      table_name = 'admin_routes',
      keep_alive = false,
      schema = v_next_schema,
      version = v_version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = v_page_id;

    insert into public.lowcode_page_versions (
      page_id,
      version,
      schema,
      published_at
    ) values (
      v_page_id,
      v_version + 1,
      v_next_schema,
      timezone('utc'::text, now())
    )
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;

  update public.lowcode_pages as list_page
  set
    edit_page_id = v_page_id,
    updated_at = case
      when list_page.edit_page_id is distinct from v_page_id
        then timezone('utc'::text, now())
      else list_page.updated_at
    end
  where list_page.code = 'admin-system-routes';
end $$;

select pg_notify('pgrst', 'reload schema');
