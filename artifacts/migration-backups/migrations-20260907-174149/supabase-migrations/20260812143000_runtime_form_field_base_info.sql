-- Register the base-info material and add its relation editor to existing databases.

begin;

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values (
  'form_field_component_type',
  U&'\5173\8054\8D44\6599',
  'base-info',
  'active',
  150,
  true,
  '{}'::jsonb
)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

update public.system_option_items
set sort_order = case value
  when 'lc-array-table' then 160
  when 'lc-sub-form' then 170
  else sort_order
end,
updated_at = timezone('utc'::text, now())
where source_code = 'form_field_component_type'
  and value in ('lc-array-table', 'lc-sub-form');

update public.lowcode_form_definitions definitions
set description = U&'\7F16\8F91\5355\4E2A\8FD0\884C\65F6\8868\5355\5B57\6BB5\7684\7EC4\4EF6\3001\5FC5\5F55\3001\6A21\5F0F\7981\7528\3001\5173\8054\8D44\6599\3001\9ED8\8BA4\503C\3001\4E0B\62C9\7F16\7801\3001\66F4\65B0\4E8B\4EF6\548C\6821\9A8C\51FD\6570\3002',
    schema = jsonb_set(
      definitions.schema,
      '{fields}',
      (
        select jsonb_agg(field_item order by sort_key)
        from (
          select field_item, ordinal * 2 as sort_key
          from jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb))
            with ordinality fields(field_item, ordinal)
          where field_item->>'field' <> 'relateInfoConfig'

          union all

          select $field$
          {
            "field": "relateInfoConfig",
            "label": "关联资料配置",
            "component": "lc-sub-form",
            "span": 2,
            "props": {
              "columns": 2,
              "padding": false,
              "schema": {
                "columns": 2,
                "fields": [
                  {
                    "field": "sourceType",
                    "label": "来源类型",
                    "component": "vxe-select",
                    "options": [
                      { "label": "实体/表/视图", "value": "entity" },
                      { "label": "低代码页面", "value": "lowcode_page" }
                    ],
                    "props": { "clearable": false }
                  },
                  { "field": "entityCode", "label": "实体编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item" } },
                  { "field": "tableName", "label": "表名/视图名", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 public.planning_item" } },
                  { "field": "resource", "label": "业务资源", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item" } },
                  { "field": "pageCode", "label": "页面编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item-list" } },
                  { "field": "sourceKey", "label": "页面数据源", "component": "vxe-input", "props": { "clearable": true, "placeholder": "留空时使用主表格" } },
                  { "field": "serviceName", "label": "服务名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "可选，例如 planning" } },
                  { "field": "serviceMethod", "label": "服务方法", "component": "vxe-input", "props": { "clearable": true, "placeholder": "可选，默认 listItems" } },
                  { "field": "valueField", "label": "值字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 id" } },
                  { "field": "displayField", "label": "显示字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 name" } },
                  { "field": "displayValueField", "label": "显示值目标字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 item_id_label" } },
                  { "field": "searchField", "label": "搜索字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 name" } },
                  { "field": "pageSize", "label": "每次加载条数", "component": "lc-number-input", "props": { "min": 1, "max": 1000 } },
                  { "field": "searchable", "label": "允许搜索", "component": "vxe-switch", "props": { "openLabel": "是", "closeLabel": "否" } },
                  {
                    "field": "fieldMappings",
                    "label": "字段映射",
                    "component": "lc-array-table",
                    "span": 2,
                    "props": {
                      "columns": [
                        { "field": "sourceField", "title": "来源字段", "minWidth": 180, "placeholder": "例如 id" },
                        { "field": "targetField", "title": "目标表单字段", "minWidth": 180, "placeholder": "例如 item_id" }
                      ],
                      "defaultRow": { "sourceField": "", "targetField": "" },
                      "rowConfig": { "keyField": "__rowKey" },
                      "toolbarButtons": [
                        { "code": "add", "label": "新增映射", "command": "add", "status": "primary" }
                      ]
                    }
                  }
                ],
                "actions": []
              }
            }
          }
          $field$::jsonb,
          coalesce(
            (
              select ordinal * 2 + 1
              from jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb))
                with ordinality existing_fields(existing_field, ordinal)
              where existing_field->>'field' = 'editDisabled'
              limit 1
            ),
            15
          )
        ) ordered_fields
      ),
      true
    )
where definitions.code = 'runtime-form-field-editor';

do $validation$
declare
  v_option_count integer;
  v_config_field jsonb;
  v_mapping_field jsonb;
begin
  select count(*)::integer
  into v_option_count
  from public.system_option_items
  where source_code = 'form_field_component_type'
    and status = 'active';

  select field_item
  into v_config_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'relateInfoConfig';

  select field_item
  into v_mapping_field
  from jsonb_array_elements(v_config_field#>'{props,schema,fields}') field_item
  where field_item->>'field' = 'fieldMappings';

  if v_option_count <> 17
    or coalesce(v_config_field->>'component', '') <> 'lc-sub-form'
    or coalesce(v_mapping_field->>'component', '') <> 'lc-array-table'
    or coalesce(jsonb_array_length(v_mapping_field#>'{props,columns}'), 0) <> 2
  then
    raise exception 'Base-info field editor validation failed: options %, config %, mappings %.',
      v_option_count, v_config_field, v_mapping_field;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
