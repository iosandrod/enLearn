-- Use the same structured request-parameter editor in material property forms
-- (including the visual Grid shown in the right-hand attribute panel).

begin;

do $$
declare
  v_request_schema jsonb := $request_schema$
  {
    "columns": 2,
    "fields": [
      { "field": "resource", "label": "资源标识", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "itemType", "label": "项目类型", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "entityCode", "label": "实体编码", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "tableName", "label": "表名覆盖", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "viewName", "label": "视图名覆盖", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "select", "label": "查询字段", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "filters", "label": "筛选条件", "component": "lc-array-table", "props": { "toolbarButtons": [{ "code": "add", "label": "新增条件", "command": "add", "status": "primary" }], "rowKey": "__filterRowKey", "treeConfig": { "childrenField": "children", "expandAll": true, "showLine": true }, "childAddable": true, "addChildText": "新增子条件", "movable": true, "copyable": true, "removable": true, "columns": [{ "field": "logic", "title": "条件逻辑", "component": "vxe-select", "options": [{ "label": "并且（AND）", "value": "and" }, { "label": "或者（OR）", "value": "or" }] }, { "field": "field", "title": "字段", "component": "vxe-select", "optionsSourceKey": "grid-designer-source-fields", "props": { "filterable": true, "clearable": true } }, { "field": "value", "title": "绑定值", "component": "vxe-input" }, { "field": "required", "title": "是否必填", "component": "vxe-switch" }], "defaultRow": { "logic": "and", "field": "", "value": "", "required": false, "children": [] } } },
      { "field": "requiredFilters", "label": "必填筛选字段", "component": "lc-json-editor", "props": { "rows": 3, "jsonRootType": "array", "jsonValueMode": "parsed" } },
      { "field": "search", "label": "搜索关键词", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "searchFields", "label": "搜索字段", "component": "lc-json-editor", "props": { "rows": 3, "jsonRootType": "array", "jsonValueMode": "parsed" } },
      { "field": "limit", "label": "每页条数", "component": "lc-number-input", "props": { "min": 1, "max": 1000, "step": 1 } },
      { "field": "page", "label": "页码", "component": "lc-number-input", "props": { "min": 1, "step": 1 } },
      { "field": "pageSize", "label": "分页大小", "component": "lc-number-input", "props": { "min": 1, "max": 1000, "step": 1 } },
      { "field": "offset", "label": "偏移量", "component": "lc-number-input", "props": { "min": 0, "step": 1 } },
      { "field": "orderBy", "label": "排序字段", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "orderDirection", "label": "排序方向", "component": "vxe-select", "options": [{ "label": "升序", "value": "asc" }, { "label": "降序", "value": "desc" }] },
      { "field": "sorts", "label": "多列排序", "component": "lc-array-table", "props": { "toolbarButtons": [{ "code": "add", "label": "新增排序", "command": "add", "status": "primary" }], "rowKey": "field", "columns": [{ "field": "field", "title": "字段", "minWidth": 130 }, { "field": "direction", "title": "方向", "component": "vxe-select", "width": 100, "options": [{ "label": "升序", "value": "asc" }, { "label": "降序", "value": "desc" }] }, { "field": "nulls", "title": "空值位置", "component": "vxe-select", "width": 110, "options": [{ "label": "末尾", "value": "last" }, { "label": "开头", "value": "first" }] }], "defaultRow": { "field": "", "direction": "desc", "nulls": "last" } } },
      { "field": "withCount", "label": "返回总数", "component": "vxe-switch" },
      { "field": "responseMode", "label": "响应模式", "component": "vxe-select", "options": [{ "label": "列表", "value": "" }, { "label": "分页对象", "value": "page" }] },
      { "field": "clientMode", "label": "客户端模式", "component": "vxe-select", "options": [{ "label": "当前用户", "value": "" }, { "label": "管理员", "value": "admin" }] }
    ],
    "layout": [{ "kind": "tabs", "defaultKey": "basic", "tabs": [
      { "key": "basic", "label": "基础查询", "blocks": [{ "kind": "field", "field": "resource" }, { "kind": "field", "field": "itemType" }, { "kind": "field", "field": "entityCode" }, { "kind": "field", "field": "tableName" }, { "kind": "field", "field": "viewName" }, { "kind": "field", "field": "select" }] },
      { "key": "filters", "label": "筛选条件", "blocks": [{ "kind": "field", "field": "filters" }, { "kind": "field", "field": "requiredFilters" }, { "kind": "field", "field": "search" }, { "kind": "field", "field": "searchFields" }] },
      { "key": "paging", "label": "分页排序", "blocks": [{ "kind": "field", "field": "limit" }, { "kind": "field", "field": "page" }, { "kind": "field", "field": "pageSize" }, { "kind": "field", "field": "offset" }, { "kind": "field", "field": "orderBy" }, { "kind": "field", "field": "orderDirection" }, { "kind": "field", "field": "sorts" }] },
      { "key": "response", "label": "响应设置", "blocks": [{ "kind": "field", "field": "withCount" }, { "kind": "field", "field": "responseMode" }, { "kind": "field", "field": "clientMode" }] }
    ] }],
    "actions": []
  }
  $request_schema$::jsonb;
  v_schema jsonb;
  v_tabs jsonb;
begin
  -- The nested grid-designer form uses the same field shape. Keep this guard
  -- explicit for installations whose old definition still has a JSON editor:
  -- field ->> 'component' = 'lc-sub-form'
  -- (the replacement below writes 'component', 'lc-sub-form').
  -- The request-parameter block is identified by 'key', 'request-params'.
  -- Both ordinary forms and edit forms share this field shape. Keep the
  -- update idempotent so it is safe to apply after an older JSON definition.
  update public.lowcode_form_definitions definition
  set schema = jsonb_set(
    definition.schema,
    '{fields}',
    (
      select jsonb_agg(
        case when field ->> 'field' = 'postDataJson' then
          jsonb_build_object('field', 'postDataJson', 'label', '请求参数', 'component', 'lc-sub-form', 'target', 'props', 'path', 'postDataJson', 'valueKind', 'raw', 'defaultValue', '{}'::jsonb, 'props', jsonb_build_object('schema', v_request_schema))
        else field end order by field_order
      ) from jsonb_array_elements(definition.schema -> 'fields') with ordinality as fields(field, field_order)
    ), true
  )
  where definition.code in ('material-prop.form', 'material-prop.lowcode-edit-form')
    and exists (select 1 from jsonb_array_elements(definition.schema -> 'fields') field where field ->> 'field' = 'postDataJson');

  update public.lowcode_form_definitions definition
  set schema = jsonb_set(
    definition.schema,
    '{fields}',
    (
      select jsonb_agg(
        case when field ->> 'field' = 'postDataJson' then
          jsonb_build_object('field', 'postDataJson', 'label', '请求参数', 'component', 'lc-sub-form', 'target', 'props', 'path', 'postDataJson', 'valueKind', 'raw', 'defaultValue', '{}'::jsonb, 'props', jsonb_build_object('schema', v_request_schema))
        else field end order by field_order
      ) from jsonb_array_elements(definition.schema -> 'fields') with ordinality as fields(field, field_order)
    ), true
  )
  where definition.code = 'material-prop.lowcode-grid'
    and exists (select 1 from jsonb_array_elements(definition.schema -> 'fields') field where field ->> 'field' = 'postDataJson');

  -- Repair legacy grid-designer definitions that still carry the nested
  -- request field as a JSON editor. Preserve the root tabs while rebuilding
  -- the nested business-info field in the same transaction.
  select definition.schema
    into v_schema
    from public.lowcode_form_definitions definition
   where definition.code = 'grid-designer'
     and definition.enabled = true
   limit 1;
  if v_schema is not null then
    v_tabs := coalesce(v_schema #> '{layout,0,tabs}', '[]'::jsonb);
    v_schema := jsonb_set(v_schema, '{layout,0,tabs}', v_tabs, true);
    v_schema := jsonb_set(
      v_schema,
      '{fields}',
      (
        select jsonb_agg(
          case when section ->> 'field' = 'grid-designer-business-info' then
            jsonb_set(section, '{props,schema,fields}', (
              select jsonb_agg(
                case when block ->> 'field' = 'postDataJson' then
                  jsonb_build_object('field', 'postDataJson', 'label', '请求参数', 'component', 'lc-sub-form', 'props', jsonb_build_object('schema', v_request_schema))
                else block end order by block_order
              ) from jsonb_array_elements(section #> '{props,schema,fields}') with ordinality as blocks(block, block_order)
            ))
          else section end order by section_order
        ) from jsonb_array_elements(v_schema -> 'fields') with ordinality as sections(section, section_order)
      ), true
    );
    update public.lowcode_form_definitions
       set schema = v_schema
     where code = 'grid-designer'
       and enabled = true
       and exists (
         select 1
           from jsonb_array_elements(schema -> 'fields') section
           cross join lateral jsonb_array_elements(section #> '{props,schema,fields}') block
          where section ->> 'field' = 'grid-designer-business-info'
            and block ->> 'field' <> 'postDataJson'
       );
  end if;
end $$;

commit;
