-- Configure generic master-detail grid submissions from database-owned page schemas.

begin;

do $$
declare
  v_schema jsonb;
  v_detail_section jsonb := $json$
  {
    "field": "grid-designer-detail-config",
    "label": "子表配置",
    "component": "lc-sub-form",
    "showTitle": false,
    "props": {
      "schema": {
        "columns": 4,
        "fields": [
          {
            "field": "enabled",
            "label": "启用子表提交",
            "component": "vxe-switch",
            "defaultValue": false,
            "help": "启用后，保存主表时会把当前表格的新增、修改和删除记录作为 __details 一并提交。"
          },
          {
            "field": "parentSourceKey",
            "label": "主表数据源",
            "component": "vxe-input",
            "props": { "clearable": true, "placeholder": "例如 salesOrder" }
          },
          {
            "field": "resource",
            "label": "子表资源",
            "component": "vxe-select",
            "optionsCode": "physical_table_name",
            "props": { "filterable": true, "clearable": true, "allowCreate": true, "placeholder": "请选择或输入子表资源" }
          },
          {
            "field": "foreignKey",
            "label": "关联外键",
            "component": "vxe-input",
            "props": { "clearable": true, "placeholder": "例如 order_id" }
          },
          {
            "field": "parentKey",
            "label": "主表关联字段",
            "component": "vxe-input",
            "defaultValue": "id",
            "props": { "clearable": true, "placeholder": "id" }
          },
          {
            "field": "updateMode",
            "label": "更新方式",
            "component": "vxe-select",
            "defaultValue": "changes",
            "options": [
              { "label": "增量变更", "value": "changes" },
              { "label": "全量替换", "value": "replace" }
            ]
          },
          {
            "field": "stripCreatedKey",
            "label": "新增时移除行主键",
            "component": "vxe-switch",
            "defaultValue": true
          },
          {
            "field": "inheritFields",
            "label": "继承主表字段",
            "component": "lc-array-table",
            "span": 4,
            "props": {
              "valueMode": "primitive",
              "valueField": "value",
              "valueTitle": "字段名",
              "rowKey": "value",
              "defaultRow": { "value": "account_id" },
              "toolbarButtons": [
                { "code": "add", "label": "新增继承字段", "command": "add", "status": "primary", "prefixIcon": "ri-add-line" }
              ]
            }
          },
          {
            "field": "defaults",
            "label": "子表新增默认值",
            "component": "lc-json-editor",
            "span": 4,
            "defaultValue": {},
            "props": { "rows": 8, "resize": "vertical", "placeholder": "{}" }
          }
        ],
        "layout": [],
        "actions": []
      }
    }
  }
  $json$::jsonb;
  v_detail_tab jsonb := $json$
  {
    "key": "detail",
    "label": "子表配置",
    "blocks": [{ "kind": "field", "field": "grid-designer-detail-config" }]
  }
  $json$::jsonb;
begin
  select schema
  into v_schema
  from public.lowcode_form_definitions
  where code = 'grid-designer'
  for update;

  if v_schema is null then
    raise exception 'Low-code form grid-designer does not exist.';
  end if;

  v_schema := jsonb_set(
    v_schema,
    '{fields}',
    coalesce((
      select jsonb_agg(field order by ordinality)
      from jsonb_array_elements(coalesce(v_schema -> 'fields', '[]'::jsonb))
        with ordinality as entry(field, ordinality)
      where field ->> 'field' <> 'grid-designer-detail-config'
    ), '[]'::jsonb) || jsonb_build_array(v_detail_section),
    true
  );

  v_schema := jsonb_set(
    v_schema,
    '{layout,0,tabs}',
    coalesce((
      select jsonb_agg(tab order by
        case tab ->> 'key'
          when 'columns' then 1
          when 'info' then 2
          when 'detail' then 3
          when 'events' then 4
          else 100
        end,
        ordinality
      )
      from (
        select tab, ordinality
        from jsonb_array_elements(coalesce(v_schema #> '{layout,0,tabs}', '[]'::jsonb))
          with ordinality as entry(tab, ordinality)
        where tab ->> 'key' <> 'detail'
        union all
        select v_detail_tab, 0::bigint
      ) tabs
    ), jsonb_build_array(v_detail_tab)),
    true
  );

  update public.lowcode_form_definitions
  set
    description = '数据表格列、表格信息、子表关系和事件属性的统一低代码表单。',
    schema = v_schema,
    enabled = true
  where code = 'grid-designer';
end $$;

create or replace function pg_temp.lowcode_set_grid_detail_config(
  node jsonb,
  target_grid_id text,
  detail_config jsonb
) returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(node) = 'array' then
    select coalesce(jsonb_agg(
      pg_temp.lowcode_set_grid_detail_config(value, target_grid_id, detail_config)
      order by ordinality
    ), '[]'::jsonb)
    into result
    from jsonb_array_elements(node) with ordinality as entry(value, ordinality);
    return result;
  end if;

  if jsonb_typeof(node) = 'object' then
    select coalesce(jsonb_object_agg(
      key,
      pg_temp.lowcode_set_grid_detail_config(value, target_grid_id, detail_config)
    ), '{}'::jsonb)
    into result
    from jsonb_each(node);

    if result ->> 'id' = target_grid_id and result ->> 'kind' = 'grid' then
      result := jsonb_set(result, '{schema,detailConfig}', detail_config, true);
    end if;
    return result;
  end if;

  return node;
end;
$$;

create or replace function pg_temp.lowcode_set_action_script(
  node jsonb,
  target_block_id text,
  target_action_code text,
  action_script text
) returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
begin
  if jsonb_typeof(node) = 'array' then
    select coalesce(jsonb_agg(
      pg_temp.lowcode_set_action_script(
        value,
        target_block_id,
        target_action_code,
        action_script
      ) order by ordinality
    ), '[]'::jsonb)
    into result
    from jsonb_array_elements(node) with ordinality as entry(value, ordinality);
    return result;
  end if;

  if jsonb_typeof(node) = 'object' then
    select coalesce(jsonb_object_agg(
      key,
      pg_temp.lowcode_set_action_script(
        value,
        target_block_id,
        target_action_code,
        action_script
      )
    ), '{}'::jsonb)
    into result
    from jsonb_each(node);

    if result ->> 'id' = target_block_id and jsonb_typeof(result -> 'actions') = 'array' then
      result := jsonb_set(
        result,
        '{actions}',
        coalesce((
          select jsonb_agg(
            case
              when action ->> 'code' = target_action_code
                then action || jsonb_build_object('script', action_script)
              else action
            end
            order by ordinality
          )
          from jsonb_array_elements(result -> 'actions')
            with ordinality as entry(action, ordinality)
        ), '[]'::jsonb),
        false
      );
    end if;
    return result;
  end if;

  return node;
end;
$$;

do $$
declare
  page record;
  v_next_schema jsonb;
  v_detail_config jsonb;
  v_grid_id text;
  v_save_script text := $script$async function main() {
  return this.executeFunction({ name: "save", args: {} });
}$script$;
begin
  for page in
    select id, code, version, schema
    from public.lowcode_pages
    where code in ('sales-orders-edit', 'admin-system-options-edit')
    order by code
    for update
  loop
    if page.code = 'sales-orders-edit' then
      v_grid_id := 'sales-order-lines-grid';
      v_detail_config := $json$
      {
        "enabled": true,
        "parentSourceKey": "salesOrder",
        "resource": "sales_order_lines",
        "foreignKey": "order_id",
        "parentKey": "id",
        "inheritFields": ["account_id"],
        "updateMode": "changes",
        "defaults": {
          "external_source": "manual",
          "status": "open",
          "is_free_gift": false,
          "metadata": {}
        },
        "stripCreatedKey": true
      }
      $json$::jsonb;
    else
      v_grid_id := 'option-source-items-grid';
      v_detail_config := $json$
      {
        "enabled": true,
        "parentSourceKey": "optionSource",
        "resource": "system_option_items",
        "foreignKey": "source_code",
        "parentKey": "code",
        "inheritFields": [],
        "updateMode": "changes",
        "defaults": {
          "status": "active",
          "sort_order": 0,
          "disabled": false,
          "is_system": false
        },
        "stripCreatedKey": true
      }
      $json$::jsonb;
    end if;

    v_next_schema := pg_temp.lowcode_set_grid_detail_config(
      page.schema,
      v_grid_id,
      v_detail_config
    );

    if page.code = 'sales-orders-edit' then
      v_next_schema := pg_temp.lowcode_set_action_script(
        v_next_schema,
        'sales-order-edit-actions',
        'save',
        v_save_script
      );
    end if;

    if v_next_schema is distinct from page.schema then
      update public.lowcode_pages
      set
        schema = v_next_schema,
        version = coalesce(page.version, 0) + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
      where id = page.id;

      insert into public.lowcode_page_versions (page_id, version, schema, published_at)
      select id, version, schema, published_at
      from public.lowcode_pages
      where id = page.id
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end loop;

  if not exists (
    select 1 from public.lowcode_pages where code = 'sales-orders-edit'
  ) then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;
  if not exists (
    select 1 from public.lowcode_pages where code = 'admin-system-options-edit'
  ) then
    raise exception 'Low-code page admin-system-options-edit does not exist.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
