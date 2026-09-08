-- Make the grid designer request-parameter editor structured while keeping
-- the persisted business field compatible with the existing postDataJson API.

begin;

do $$
declare
  v_request_schema jsonb := $request_schema$
  {
    "columns": 2,
    "fields": [
      { "field": "resource", "label": "资源标识", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如：profiles" } },
      { "field": "itemType", "label": "项目类型", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如：users" } },
      { "field": "entityCode", "label": "实体编码", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "tableName", "label": "表名覆盖", "component": "vxe-input", "props": { "clearable": true, "placeholder": "仅自定义数据源使用" } },
      { "field": "viewName", "label": "视图名覆盖", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "select", "label": "查询字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "*" } },
      {
        "field": "filters", "label": "筛选条件", "component": "lc-array-table",
        "props": {
          "toolbarButtons": [{ "code": "add", "label": "新增条件", "command": "add", "status": "primary" }],
          "toolbarAlign": "left",
          "rowKey": "__filterRowKey",
          "treeConfig": { "childrenField": "children", "expandAll": true, "showLine": true, "indent": 20 },
          "childAddable": true,
          "addChildText": "新增子条件",
          "movable": true,
          "copyable": true,
          "removable": true,
          "actionWidth": 150,
          "columns": [
            {
              "field": "logic", "title": "条件逻辑", "component": "vxe-select", "width": 110,
              "options": [{ "label": "并且（AND）", "value": "and" }, { "label": "或者（OR）", "value": "or" }]
            },
            {
              "field": "field", "title": "字段", "component": "vxe-select", "minWidth": 180,
              "optionsSourceKey": "grid-designer-source-fields",
              "props": { "filterable": true, "clearable": true, "placeholder": "条件组可留空" }
            },
            { "field": "value", "title": "绑定值", "component": "vxe-input", "minWidth": 260, "placeholder": "固定值或 {{ forms.formId.field }}" },
            { "field": "required", "title": "是否必填", "component": "vxe-switch", "width": 100, "defaultValue": false }
          ],
          "defaultRow": { "logic": "and", "field": "", "value": "", "required": false, "children": [] }
        }
      },
      { "field": "requiredFilters", "label": "必填筛选字段", "component": "lc-json-editor", "props": { "rows": 3, "jsonRootType": "array", "jsonValueMode": "parsed", "placeholder": "例如：[\"account_id\"]" } },
      { "field": "search", "label": "搜索关键词", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "searchFields", "label": "搜索字段", "component": "lc-json-editor", "props": { "rows": 3, "jsonRootType": "array", "jsonValueMode": "parsed", "placeholder": "例如：[\"name\",\"code\"]" } },
      { "field": "limit", "label": "每页条数", "component": "lc-number-input", "props": { "min": 1, "max": 1000, "step": 1 } },
      { "field": "page", "label": "页码", "component": "lc-number-input", "props": { "min": 1, "step": 1 } },
      { "field": "pageSize", "label": "分页大小", "component": "lc-number-input", "props": { "min": 1, "max": 1000, "step": 1 } },
      { "field": "offset", "label": "偏移量", "component": "lc-number-input", "props": { "min": 0, "step": 1 } },
      { "field": "orderBy", "label": "排序字段", "component": "vxe-input", "props": { "clearable": true } },
      { "field": "orderDirection", "label": "排序方向", "component": "vxe-select", "options": [{ "label": "升序", "value": "asc" }, { "label": "降序", "value": "desc" }] },
      {
        "field": "sorts", "label": "多列排序", "component": "lc-array-table",
        "props": {
          "toolbarButtons": [{ "code": "add", "label": "新增排序", "command": "add", "status": "primary" }],
          "rowKey": "field",
          "columns": [
            { "field": "field", "title": "字段", "minWidth": 130, "placeholder": "created_at" },
            { "field": "direction", "title": "方向", "component": "vxe-select", "width": 100, "options": [{ "label": "升序", "value": "asc" }, { "label": "降序", "value": "desc" }] },
            { "field": "nulls", "title": "空值位置", "component": "vxe-select", "width": 110, "options": [{ "label": "末尾", "value": "last" }, { "label": "开头", "value": "first" }] }
          ],
          "defaultRow": { "field": "", "direction": "desc", "nulls": "last" }
        }
      },
      { "field": "withCount", "label": "返回总数", "component": "vxe-switch" },
      { "field": "responseMode", "label": "响应模式", "component": "vxe-select", "options": [{ "label": "列表", "value": "" }, { "label": "分页对象", "value": "page" }] },
      { "field": "clientMode", "label": "客户端模式", "component": "vxe-select", "options": [{ "label": "当前用户", "value": "" }, { "label": "管理员", "value": "admin" }] }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础查询",
            "blocks": [
              { "kind": "field", "field": "resource" },
              { "kind": "field", "field": "itemType" },
              { "kind": "field", "field": "entityCode" },
              { "kind": "field", "field": "tableName" },
              { "kind": "field", "field": "viewName" },
              { "kind": "field", "field": "select" }
            ]
          },
          {
            "key": "filters",
            "label": "筛选条件",
            "blocks": [
              { "kind": "field", "field": "filters" },
              { "kind": "field", "field": "requiredFilters" },
              { "kind": "field", "field": "search" },
              { "kind": "field", "field": "searchFields" }
            ]
          },
          {
            "key": "paging",
            "label": "分页排序",
            "blocks": [
              { "kind": "field", "field": "limit" },
              { "kind": "field", "field": "page" },
              { "kind": "field", "field": "pageSize" },
              { "kind": "field", "field": "offset" },
              { "kind": "field", "field": "orderBy" },
              { "kind": "field", "field": "orderDirection" },
              { "kind": "field", "field": "sorts" }
            ]
          },
          {
            "key": "response",
            "label": "响应设置",
            "blocks": [
              { "kind": "field", "field": "withCount" },
              { "kind": "field", "field": "responseMode" },
              { "kind": "field", "field": "clientMode" }
            ]
          }
        ]
      }
    ],
    "actions": []
  }
  $request_schema$::jsonb;
begin
  update public.lowcode_form_definitions definition
  set schema = jsonb_set(
    definition.schema,
    '{fields}',
    (
      select jsonb_agg(
        case
          when section ->> 'field' = 'grid-designer-business-info' then
            jsonb_set(
              section,
              '{props,schema,fields}',
              (
                select jsonb_agg(
                  case
                    when field ->> 'field' = 'postDataJson' then
                      jsonb_build_object(
                        'field', 'postDataJson',
                        'label', '请求参数',
                        'component', 'lc-sub-form',
                        'props', jsonb_build_object('schema', v_request_schema)
                      )
                    else field
                  end
                  order by field_order
                )
                from jsonb_array_elements(section #> '{props,schema,fields}')
                  with ordinality as fields(field, field_order)
              )
            )
          else section
        end
        order by section_order
      )
      from jsonb_array_elements(definition.schema -> 'fields')
        with ordinality as sections(section, section_order)
    )
  )
  where definition.code = 'grid-designer'
    and definition.enabled = true
    and exists (
      select 1
      from jsonb_array_elements(definition.schema -> 'fields') section
      cross join lateral jsonb_array_elements(section #> '{props,schema,fields}') field
      where section ->> 'field' = 'grid-designer-business-info'
        and field ->> 'field' = 'postDataJson'
    );
end $$;

do $$
declare
  v_source_code text;
  v_old_helper text := $old_helper$function mergeListFilters(configured, additions) {
  const entries = Object.entries(additions || {});
  if (!entries.length) return configured;
  if (isRecord(configured) && Array.isArray(configured.conditions) &&
      (configured.logic === 'and' || configured.logic === 'or')) {
    return {
      logic: 'and',
      conditions: [configured, ...entries.map(([field, value]) => ({ field, value }))],
    };
  }
  return { ...(isRecord(configured) ? configured : {}), ...additions };
}
$old_helper$;
  v_helper text := $helper$function isFilterGroup(value) {
  return isRecord(value) && Array.isArray(value.conditions) &&
    (value.logic === 'and' || value.logic === 'or');
}
function readFilterEntries(filters, conditionNode = false) {
  if (isFilterGroup(filters)) {
    return filters.conditions.flatMap((condition) => readFilterEntries(condition, true));
  }
  if (!isRecord(filters)) return [];
  if (conditionNode) {
    const field = readString(filters.field);
    return field ? [{ field, value: filters.value }] : [];
  }
  return Object.entries(filters).map(([field, value]) => ({ field, value }));
}
function pruneFilterFields(filters, fields, conditionNode = false) {
  if (isFilterGroup(filters)) {
    const conditions = filters.conditions
      .map((condition) => pruneFilterFields(condition, fields, true))
      .filter((condition) => condition !== undefined);
    return conditions.length ? { ...filters, conditions } : undefined;
  }
  if (!isRecord(filters)) return undefined;
  if (conditionNode) {
    return fields.has(readString(filters.field)) ? undefined : filters;
  }
  return Object.fromEntries(
    Object.entries(filters).filter(([field]) => !fields.has(field))
  );
}
function mergeListFilters(configured, additions) {
  const entries = Object.entries(additions || {});
  if (!entries.length) return isRecord(configured) ? configured : {};
  if (isFilterGroup(configured)) {
    const retained = pruneFilterFields(
      configured,
      new Set(entries.map(([field]) => field))
    );
    return {
      logic: 'and',
      conditions: [
        ...(retained ? [retained] : []),
        ...entries.map(([field, value]) => ({ field, value })),
      ],
    };
  }
  return { ...(isRecord(configured) ? configured : {}), ...additions };
}
$helper$;
  v_old text := $old$    const filters = {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      ...queryFormFilters,
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    };$old$;
  v_new text := $new$    const filters = mergeListFilters(postData.filters, {
      ...queryFormFilters,
      ...(isRecord(this.searches[sourceKey]) ? this.searches[sourceKey] : {}),
      ...(isRecord(options.filters) ? options.filters : {}),
    });$new$;
  v_old_infer text := $old_infer$function inferFilterMap(filters, requiredFilters, mainRow) {
  const relationFields = Object.entries(filters)
    .filter(([, value]) => isPlaceholder(value))
    .map(([field]) => field);
  const missing = requiredFilters.filter((field) =>
    !hasValue(filters[field]) || isPlaceholder(filters[field]));
  return Object.fromEntries([...new Set([...relationFields, ...missing])].map((detailField) => {
    const configured = filters[detailField];
    const expressionField = typeof configured === 'string'
      ? configured.match(/\{\{\s*(?:(?:data|grids)\.[^.]+(?:\.currentRow)?|event\.row|row)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/)?.[1] ?? ''
      : '';
    const directField = detailField in mainRow ? detailField : '';
    const conventionalField = detailField.endsWith('_id') && 'id' in mainRow ? 'id' : '';
    return [detailField, expressionField || directField || conventionalField || detailField];
  }));
}$old_infer$;
  v_new_infer text := $new_infer$function inferFilterMap(filters, requiredFilters, mainRow) {
  const entries = readFilterEntries(filters);
  const relationFields = entries
    .filter(({ value }) => isPlaceholder(value))
    .map(({ field }) => field);
  const missing = requiredFilters.filter((field) => {
    const values = entries
      .filter((entry) => entry.field === field)
      .map((entry) => entry.value);
    return !values.length || values.some((value) =>
      !hasValue(value) || isPlaceholder(value));
  });
  return Object.fromEntries([...new Set([...relationFields, ...missing])].map((detailField) => {
    const configured = entries.find((entry) =>
      entry.field === detailField && isPlaceholder(entry.value))?.value ??
      entries.find((entry) => entry.field === detailField)?.value;
    const expressionField = typeof configured === 'string'
      ? configured.match(/\{\{\s*(?:(?:data|grids)\.[^.]+(?:\.currentRow)?|event\.row|row)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/)?.[1] ?? ''
      : '';
    const directField = detailField in mainRow ? detailField : '';
    const conventionalField = detailField.endsWith('_id') && 'id' in mainRow ? 'id' : '';
    return [detailField, expressionField || directField || conventionalField || detailField];
  }));
}$new_infer$;
  v_old_detail text := $old_detail$    const filters = {
      ...configuredFilters,
      ...searchFilters,
      ...relationFilters,
      ...explicitFilters,
      ...detailRelationFilters,
    };
    const runtimeFields = Object.entries({ ...searchFilters, ...explicitFilters })
      .filter(([, value]) => hasValue(value) && !isPlaceholder(value))
      .map(([field]) => field);
    const nextRequired = [...new Set([
      ...requiredFilters,
      ...Object.keys(filterMap),
      ...(detailRelation ? [detailRelation.foreignKey] : []),
      ...runtimeFields,
    ])];
    const missingRequired = nextRequired.some((field) =>
      !hasValue(filters[field]) || isPlaceholder(filters[field]));
    const hasQueryFilters = Object.values(filters).some((value) =>
      hasValue(value) && !isPlaceholder(value));$old_detail$;
  v_new_detail text := $new_detail$    const filters = mergeListFilters(configuredFilters, {
      ...searchFilters,
      ...relationFilters,
      ...explicitFilters,
      ...detailRelationFilters,
    });
    const runtimeFields = Object.entries({ ...searchFilters, ...explicitFilters })
      .filter(([, value]) => hasValue(value) && !isPlaceholder(value))
      .map(([field]) => field);
    const nextRequired = [...new Set([
      ...requiredFilters,
      ...Object.keys(filterMap),
      ...(detailRelation ? [detailRelation.foreignKey] : []),
      ...runtimeFields,
    ])];
    const filterEntries = readFilterEntries(filters);
    const missingRequired = nextRequired.some((field) => {
      const values = filterEntries
        .filter((entry) => entry.field === field)
        .map((entry) => entry.value);
      return !values.length || values.some((value) =>
        !hasValue(value) || isPlaceholder(value));
    });
    const hasQueryFilters = filterEntries.some(({ value }) =>
      hasValue(value) && !isPlaceholder(value));$new_detail$;
begin
  select source_code
    into v_source_code
  from public.lowcode_node_actions
  where node_type = 'grid'
    and action_code = 'loadData'
  for update;

  if v_source_code is null then
    raise exception 'Low-code grid loadData action does not exist.';
  end if;

  if position(v_helper in v_source_code) = 0 then
    if position(v_old_helper in v_source_code) > 0 then
      v_source_code := replace(v_source_code, v_old_helper, v_helper);
    elsif position('async function main() {' in v_source_code) = 0 then
      raise exception 'Low-code grid loadData action has an unsupported source format.';
    else
      v_source_code := replace(
        v_source_code,
        'async function main() {',
        v_helper || E'\nasync function main() {'
      );
    end if;
  end if;

  if position(v_old in v_source_code) > 0 then
    v_source_code := replace(v_source_code, v_old, v_new);
  elsif position('const filters = mergeListFilters(postData.filters' in v_source_code) = 0 then
    raise exception 'Low-code grid loadData action has an unsupported filter merge anchor.';
  end if;

  if position(v_old_infer in v_source_code) > 0 then
    v_source_code := replace(v_source_code, v_old_infer, v_new_infer);
  elsif position('const entries = readFilterEntries(filters);' in v_source_code) = 0 then
    raise exception 'Low-code detail grid filter inference has an unsupported source format.';
  end if;

  if position(v_old_detail in v_source_code) > 0 then
    v_source_code := replace(v_source_code, v_old_detail, v_new_detail);
  elsif position('const filters = mergeListFilters(configuredFilters' in v_source_code) = 0 then
    raise exception 'Low-code detail grid loadData action has an unsupported filter merge anchor.';
  end if;

  update public.lowcode_node_actions
  set source_code = v_source_code,
      updated_at = timezone('utc'::text, now())
  where node_type = 'grid'
    and action_code = 'loadData';
end $$;

-- Some installations still have an array-table material that only emits
-- onToolbarAction and does not interpret command: 'add'. Patch that published
-- source so declarative toolbar buttons can append rows.
do $material_patch$
declare
  v_source text;
  v_replacement text := $replacement$  if (button.command === 'add') {
    addRow(button.row);
    return;
  }
  emitConfiguredEvent('onToolbarAction', actionPayload);$replacement$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null
     and position('emitConfiguredEvent(''onToolbarAction'', actionPayload);' in v_source) > 0
     and position('button.command === ''add''' in v_source) = 0 then
    v_source := replace(
      v_source,
      '  emitConfiguredEvent(''onToolbarAction'', actionPayload);',
      v_replacement
    );
    update public.lowcode_materials
    set source_text = v_source,
        source_hash = encode(digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex'),
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $material_patch$;

-- VXE button-group has emitted slightly different click payload shapes across
-- versions. Normalize those shapes so a single declarative add button can
-- never become a silent no-op because its name was omitted or type-coerced.
do $toolbar_click_patch$
declare
  v_source text;
  v_old text := $old_toolbar_click$async function handleToolbarButtonClick(payload: ArrayTableToolbarClickParams) {
  const clickedCode = payload.option?.name ?? payload.name;
  const button = toolbarButtons.value.find((item) => item.code === clickedCode);
  if (isReadonly.value || !button || button.disabled) return;
$old_toolbar_click$;
  v_new text := $new_toolbar_click$async function handleToolbarButtonClick(payload: ArrayTableToolbarClickParams) {
  const clickedCode = payload.option?.name ?? payload.option?.code ?? payload.name;
  const button = toolbarButtons.value.find((item) =>
    item.code === clickedCode || String(item.code) === String(clickedCode)
  ) ?? (toolbarButtons.value.length === 1 ? toolbarButtons.value[0] : undefined);
  if (isReadonly.value || !button || button.disabled) return;
$new_toolbar_click$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null and position(v_old in v_source) > 0 then
    v_source := replace(v_source, v_old, v_new);
    update public.lowcode_materials
    set source_text = v_source,
        source_hash = encode(digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex'),
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $toolbar_click_patch$;

-- Render toolbar items with an explicit child click handler. This keeps the
-- add action functional even when a VXE button-group build does not forward
-- the option payload through its group-level click event.
do $toolbar_render_patch$
declare
  v_source text;
  v_old text := $old_toolbar_render$      <vxe-button-group
        size="mini"
        :options="toolbarButtonOptions"
        @click="handleToolbarButtonClick"
      />$old_toolbar_render$;
  v_new text := $new_toolbar_render$      <div class="lc-array-table__toolbar-buttons">
        <button
          v-for="button in toolbarButtons"
          :key="String(button.code)"
          type="button"
          :class="button.status ? `is-${button.status}` : ''"
          :disabled="isReadonly || button.disabled === true"
          @click.stop.prevent="handleToolbarButtonClick({ name: button.code, option: button })"
        >
          {{ button.label }}
        </button>
      </div>$new_toolbar_render$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null and position(v_old in v_source) > 0 then
    v_source := replace(v_source, v_old, v_new);
    update public.lowcode_materials
    set source_text = v_source,
        source_hash = encode(digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex'),
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $toolbar_render_patch$;

-- Convert an already-patched VXE child-button toolbar to native buttons as
-- well, so re-running this migration also repairs installations updated by a
-- previous version of the toolbar patch.
do $toolbar_native_upgrade$
declare
  v_source text;
  v_old text := $old_native_upgrade$      <vxe-button-group size="mini">
        <vxe-button
          v-for="button in toolbarButtons"
          :key="String(button.code)"
          :status="button.status"
          :disabled="isReadonly || button.disabled === true"
          @click="handleToolbarButtonClick({ name: button.code, option: button })"
        >
          {{ button.label }}
        </vxe-button>
      </vxe-button-group>$old_native_upgrade$;
  v_new text := $new_native_upgrade$      <div class="lc-array-table__toolbar-buttons">
        <button
          v-for="button in toolbarButtons"
          :key="String(button.code)"
          type="button"
          :class="button.status ? `is-${button.status}` : ''"
          :disabled="isReadonly || button.disabled === true"
          @click.stop.prevent="handleToolbarButtonClick({ name: button.code, option: button })"
        >
          {{ button.label }}
        </button>
      </div>$new_native_upgrade$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null and position(v_old in v_source) > 0 then
    v_source := replace(v_source, v_old, v_new);
    update public.lowcode_materials
    set source_text = v_source,
        source_hash = encode(digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex'),
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $toolbar_native_upgrade$;

-- For the declarative add command, invoke addRow directly from the template.
-- This bypasses event-payload normalization entirely while preserving the
-- generic handler for custom toolbar commands.
do $toolbar_direct_add$
declare
  v_source text;
  v_old text := $old_toolbar_direct_add$@click.stop.prevent="handleToolbarButtonClick({ name: button.code, option: button })"$old_toolbar_direct_add$;
  v_new text := $new_toolbar_direct_add$@click.stop.prevent="button.command === 'add' || button.code === 'add' ? addRow(button.row) : handleToolbarButtonClick({ name: button.code, option: button })"$new_toolbar_direct_add$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null and position(v_old in v_source) > 0 then
    v_source := replace(v_source, v_old, v_new);
    update public.lowcode_materials
    set source_text = v_source,
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $toolbar_direct_add$;

-- Keep the declarative add action functional when a material adapter normalizes
-- toolbar buttons without carrying the command field through to the template.
do $toolbar_direct_add_code_fallback$
declare
  v_source text;
  v_old text := $old_toolbar_direct_add_code_fallback$@click.stop.prevent="button.command === 'add' ? addRow(button.row) : handleToolbarButtonClick({ name: button.code, option: button })"$old_toolbar_direct_add_code_fallback$;
  v_new text := $new_toolbar_direct_add_code_fallback$@click.stop.prevent="button.command === 'add' || button.code === 'add' ? addRow(button.row) : handleToolbarButtonClick({ name: button.code, option: button })"$new_toolbar_direct_add_code_fallback$;
begin
  select source_text into v_source
  from public.lowcode_materials
  where code = 'lc-array-table'
    and material_kind = 'form'
    and enabled = true
    and status = 'published'
  order by updated_at desc
  limit 1;

  if v_source is not null and position(v_old in v_source) > 0 then
    v_source := replace(v_source, v_old, v_new);
    update public.lowcode_materials
    set source_text = v_source,
        source_hash = encode(digest(convert_to(v_source, 'UTF8'), 'sha256'), 'hex'),
        updated_at = timezone('utc'::text, now())
    where code = 'lc-array-table'
      and material_kind = 'form'
      and enabled = true
      and status = 'published';
  end if;
end $toolbar_direct_add_code_fallback$;

-- Invalidate the browser material compiler cache after any prior patch has
-- already been applied. The compiler cache key includes source_hash.
update public.lowcode_materials
set source_hash = encode(digest(convert_to(source_text, 'UTF8'), 'sha256'), 'hex'),
    updated_at = timezone('utc'::text, now())
where code = 'lc-array-table'
  and material_kind = 'form'
  and enabled = true
  and status = 'published'
  and source_hash is distinct from encode(digest(convert_to(source_text, 'UTF8'), 'sha256'), 'hex');

commit;
