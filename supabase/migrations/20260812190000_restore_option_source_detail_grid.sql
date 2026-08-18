-- Restore the dictionary-detail table removed from the option-source edit page.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_detail_grid jsonb := $json$
  {
    "id": "option-source-items-grid",
    "kind": "grid",
    "title": "字典明细",
    "sourceKey": "optionItems",
    "layout": { "fillRemaining": true },
    "schema": {
      "title": "字典明细",
      "grid": {
        "border": true,
        "stripe": true,
        "showOverflow": "tooltip",
        "height": 320,
        "rowConfig": { "keyField": "id", "isCurrent": true },
        "columnConfig": { "resizable": true },
        "columns": [
          { "type": "seq", "title": "序号", "width": 64, "align": "center" },
          { "field": "label", "title": "显示文本", "minWidth": 180, "fixed": "left" },
          { "field": "value", "title": "选项值", "minWidth": 180, "fixed": "left" },
          { "field": "parent_value", "title": "父级值", "minWidth": 140 },
          { "field": "color", "title": "颜色", "width": 110, "align": "center" },
          { "field": "disabled", "title": "禁用", "width": 88, "align": "center", "formatter": { "type": "enum", "map": { "true": "是", "false": "否" }, "emptyText": "否" } },
          { "field": "status", "title": "状态", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "active": "启用", "inactive": "停用" }, "emptyText": "-" } },
          { "field": "sort_order", "title": "排序", "width": 88, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
          { "field": "is_system", "title": "系统", "width": 88, "align": "center", "formatter": { "type": "enum", "map": { "true": "是", "false": "否" }, "emptyText": "否" } },
          { "field": "updated_at", "title": "更新时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
        ]
      },
      "rowActions": { "edit": false, "delete": false }
    }
  }
  $json$::jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'admin-system-options-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page admin-system-options-edit does not exist.';
  end if;

  v_next_schema := v_schema;
  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,optionSource,autoLoad}',
    'true'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,optionItems,autoLoad}',
    'true'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,optionItems,loadAfterSourceKeys}',
    '["optionSource"]'::jsonb,
    true
  );

  if not jsonb_path_exists(
    v_next_schema,
    '$.blocks[*] ? (@.id == "option-source-items-grid")'
  ) and not jsonb_path_exists(
    v_next_schema,
    '$.blocks[*].tabs[*].blocks[*] ? (@.id == "option-source-items-grid")'
  ) then
    v_next_schema := jsonb_set(
      v_next_schema,
      '{blocks}',
      coalesce(v_next_schema -> 'blocks', '[]'::jsonb) || jsonb_build_array(v_detail_grid),
      true
    );
  end if;

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = coalesce(v_version, 0) + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = v_page_id
    returning version into v_version;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    select id, version, schema, published_at
    from public.lowcode_pages
    where id = v_page_id
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
