begin;

-- Update only the array-table property definition, preserving custom fields,
-- defaults and tabs. Button scripts are plain strings edited with Monaco.
do $$
declare
  definition jsonb;
  candidate jsonb;
  managed_fields jsonb := $fields$[
    {"field":"rowDraggable","label":"启用拖拽排序","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
    {"field":"rowDragConfig","label":"拖拽配置","component":"lc-sub-form","valueKind":"raw","defaultValue":{"trigger":"cell","showIcon":true,"animation":true,"showGuidesStatus":true,"showDragTip":true},"props":{"schema":{"fields":[
      {"field":"trigger","label":"拖拽触发区域","component":"vxe-select","defaultValue":"cell","options":[{"label":"拖拽手柄","value":"cell"},{"label":"整行","value":"row"}]},
      {"field":"showIcon","label":"显示拖拽图标","component":"vxe-switch","defaultValue":true},
      {"field":"animation","label":"排序动画","component":"vxe-switch","defaultValue":true},
      {"field":"showGuidesStatus","label":"显示引导线","component":"vxe-switch","defaultValue":true},
      {"field":"showDragTip","label":"显示拖拽提示","component":"vxe-switch","defaultValue":true},
      {"field":"isPeerDrag","label":"允许同级拖拽","component":"vxe-switch","defaultValue":true},
      {"field":"isCrossDrag","label":"允许跨层级拖拽","component":"vxe-switch","defaultValue":true},
      {"field":"isToChildDrag","label":"允许拖为子项","component":"vxe-switch","defaultValue":true},
      {"field":"isSelfToChildDrag","label":"允许同层级拖为子项","component":"vxe-switch","defaultValue":true}
    ],"actions":[]}}},
    {"field":"showActions","label":"显示操作列","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
    {"field":"actionWidth","label":"操作列宽度","component":"lc-number-input","valueKind":"number","props":{"min":40,"clearable":true},"help":"留空时按按钮数量自动计算。"},
    {"field":"rowActions","label":"操作列按钮数组","component":"lc-array-table","valueKind":"raw","defaultValue":[],"help":"可拖拽调整顺序。脚本优先于内置操作；this.event 含 field、row、index、rows、formValues。返回 { row: { ...this.event.row, status: 'done' } } 更新当前行，或返回 { rows: [...] } 替换全部行。","props":{
      "rowKey":"__rowKey","rowDraggable":true,"height":280,"copyable":true,
      "defaultRow":{"code":"","label":"","title":"","icon":"","command":"","status":"","visible":true,"disabled":false,"script":""},
      "toolbarButtons":[{"code":"add","label":"新增按钮","command":"add","status":"primary"}],
      "columns":[
        {"field":"code","title":"按钮标识","minWidth":120},
        {"field":"label","title":"按钮文字","minWidth":110},
        {"field":"title","title":"提示文字","minWidth":110},
        {"field":"icon","title":"图标类名","minWidth":130},
        {"field":"command","title":"内置操作","component":"vxe-select","minWidth":130,"options":[{"label":"自定义","value":""},{"label":"复制","value":"copy"},{"label":"删除","value":"remove"},{"label":"上移","value":"moveUp"},{"label":"下移","value":"moveDown"},{"label":"新增子项","value":"addChild"}]},
        {"field":"status","title":"按钮样式","component":"vxe-select","minWidth":110,"options":[{"label":"默认","value":""},{"label":"主要","value":"primary"},{"label":"成功","value":"success"},{"label":"警告","value":"warning"},{"label":"危险","value":"danger"},{"label":"信息","value":"info"}]},
        {"field":"visible","title":"显示","component":"vxe-switch","width":72},
        {"field":"disabled","title":"禁用","component":"vxe-switch","width":72},
        {"field":"script","title":"执行脚本","component":"lc-monaco-editor","minWidth":180,"props":{"language":"javascript","dialog":true,"dialogTitle":"操作列按钮脚本","scriptThisType":"LowCodeButtonScriptThis","contextDrawer":true}}
      ]}},
    {"field":"copyable","label":"显示内置复制按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
    {"field":"movable","label":"显示内置上移/下移按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
    {"field":"removable","label":"显示内置删除按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
    {"field":"childAddable","label":"显示新增子项按钮","component":"vxe-switch","valueKind":"boolean","defaultValue":false,"help":"启用树形配置后生效。"},
    {"field":"addChildText","label":"新增子项提示文字","component":"vxe-input","valueKind":"string","defaultValue":"新增子项"},
    {"field":"showToolbar","label":"显示工具栏","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
    {"field":"toolbarAlign","label":"工具栏对齐","component":"vxe-select","valueKind":"string","defaultValue":"left","options":[{"label":"左对齐","value":"left"},{"label":"居中","value":"center"},{"label":"右对齐","value":"right"}]},
    {"field":"toolbarButtons","label":"工具栏按钮数组","component":"lc-array-table","valueKind":"raw","defaultValue":[{"code":"add","label":"新增","command":"add","status":"primary"}],"help":"可拖拽调整顺序。脚本优先执行；this.event 含 field、rows、formValues。返回 { rows: [...] } 替换全部行。页面内脚本可使用页面授权的 API、函数和节点动作。","props":{
      "rowKey":"__rowKey","rowDraggable":true,"height":280,"copyable":true,
      "defaultRow":{"code":"","label":"","command":"","status":"","icon":"","visible":true,"disabled":false,"script":""},
      "toolbarButtons":[{"code":"add","label":"新增按钮","command":"add","status":"primary"}],
      "columns":[
        {"field":"code","title":"按钮标识","minWidth":120},
        {"field":"label","title":"按钮文字","minWidth":110},
        {"field":"command","title":"内置操作","component":"vxe-select","minWidth":130,"options":[{"label":"自定义","value":""},{"label":"新增行","value":"add"}]},
        {"field":"row","title":"新增行数据","component":"lc-json-editor","minWidth":160,"props":{"jsonRootType":"object","jsonValueMode":"parsed","dialog":true}},
        {"field":"icon","title":"图标类名","minWidth":130},
        {"field":"status","title":"按钮样式","component":"vxe-select","minWidth":110,"options":[{"label":"默认","value":""},{"label":"主要","value":"primary"},{"label":"成功","value":"success"},{"label":"警告","value":"warning"},{"label":"危险","value":"danger"},{"label":"信息","value":"info"}]},
        {"field":"visible","title":"显示","component":"vxe-switch","width":72},
        {"field":"disabled","title":"禁用","component":"vxe-switch","width":72},
        {"field":"script","title":"执行脚本","component":"lc-monaco-editor","minWidth":180,"props":{"language":"javascript","dialog":true,"dialogTitle":"工具栏按钮脚本","scriptThisType":"LowCodeButtonScriptThis","contextDrawer":true}}
      ]}},
    {"field":"showSeq","label":"显示序号列","component":"vxe-switch","valueKind":"boolean","defaultValue":true},
    {"field":"readonly","label":"只读","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
    {"field":"disabled","label":"禁用","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
    {"field":"minRows","label":"最少保留行数","component":"lc-number-input","valueKind":"number","defaultValue":0,"props":{"min":0,"digits":0}},
    {"field":"defaultRow","label":"新增行默认值","component":"lc-json-editor","valueKind":"json","defaultValue":{},"props":{"jsonRootType":"object","jsonValueMode":"parsed","rows":5}},
    {"field":"preserveRowKey","label":"保存行主键","component":"vxe-switch","valueKind":"boolean","defaultValue":false},
    {"field":"treeConfig","label":"树形配置","component":"lc-json-editor","valueKind":"json","props":{"jsonRootType":"object","jsonValueMode":"parsed","rows":5},"help":"留空为普通表格；例如 { \"childrenField\": \"children\", \"expandAll\": true }。"},
    {"field":"valueMode","label":"数组值类型","component":"vxe-select","valueKind":"string","defaultValue":"object","options":[{"label":"对象数组","value":"object"},{"label":"基础值数组","value":"primitive"}]},
    {"field":"valueField","label":"基础值字段名","component":"vxe-input","valueKind":"string","defaultValue":"value"},
    {"field":"valueTitle","label":"基础值列标题","component":"vxe-input","valueKind":"string","defaultValue":"值"}
  ]$fields$::jsonb;
  managed_tabs jsonb := $tabs$[
    {"key":"drag","label":"拖拽排序","blocks":[{"kind":"field","field":"rowDraggable"},{"kind":"field","field":"rowDragConfig"}]},
    {"key":"actions","label":"操作列","blocks":[{"kind":"field","field":"showActions"},{"kind":"field","field":"actionWidth"},{"kind":"field","field":"rowActions"},{"kind":"field","field":"copyable"},{"kind":"field","field":"movable"},{"kind":"field","field":"removable"},{"kind":"field","field":"childAddable"},{"kind":"field","field":"addChildText"}]},
    {"key":"toolbar","label":"工具栏","blocks":[{"kind":"field","field":"showToolbar"},{"kind":"field","field":"toolbarAlign"},{"kind":"field","field":"toolbarButtons"}]},
    {"key":"behavior","label":"数据与行为","blocks":[{"kind":"field","field":"showSeq"},{"kind":"field","field":"readonly"},{"kind":"field","field":"disabled"},{"kind":"field","field":"minRows"},{"kind":"field","field":"defaultRow"},{"kind":"field","field":"preserveRowKey"},{"kind":"field","field":"treeConfig"},{"kind":"field","field":"valueMode"},{"kind":"field","field":"valueField"},{"kind":"field","field":"valueTitle"}]}
  ]$tabs$::jsonb;
  old_field jsonb;
  fields jsonb;
  form_layout jsonb;
  tabs jsonb;
  tab jsonb;
  blocks jsonb;
  tabs_index integer;
begin
  select schema into definition from public.lowcode_form_definitions
  where code = 'material-prop.array-table' for update;
  if definition is null then raise exception 'Array-table property form is missing.'; end if;

  fields := case when jsonb_typeof(definition->'fields') = 'array' then definition->'fields' else '[]'::jsonb end;
  for candidate in select value from jsonb_array_elements(managed_fields) loop
    candidate := jsonb_build_object('target', 'props', 'path', candidate->>'field') || candidate;
    select value into old_field from jsonb_array_elements(fields) where value->>'field' = candidate->>'field';
    if old_field is not null then
      candidate := old_field || candidate ||
        case when old_field ? 'defaultValue' then jsonb_build_object('defaultValue', old_field->'defaultValue') else '{}'::jsonb end;
      select jsonb_agg(case when value->>'field' = candidate->>'field' then candidate else value end order by ordinality)
      into fields from jsonb_array_elements(fields) with ordinality;
    else
      fields := fields || jsonb_build_array(candidate);
    end if;
  end loop;

  form_layout := case when jsonb_typeof(definition->'layout') = 'array' then definition->'layout' else '[]'::jsonb end;
  select (ordinality - 1)::integer into tabs_index
  from jsonb_array_elements(form_layout) with ordinality where value->>'kind' = 'tabs' limit 1;
  if tabs_index is null then
    form_layout := jsonb_build_array(jsonb_build_object('kind','tabs','defaultKey','basic','tabs',
      jsonb_build_array(jsonb_build_object('key','basic','label','基础','blocks',form_layout))));
    tabs_index := 0;
  end if;
  tabs := '[]'::jsonb;
  for tab in select value from jsonb_array_elements(
    case when jsonb_typeof(form_layout->tabs_index->'tabs') = 'array'
      then form_layout->tabs_index->'tabs' else '[]'::jsonb end
  ) loop
    select coalesce(jsonb_agg(block.value order by block.ordinality), '[]'::jsonb) into blocks
    from jsonb_array_elements(case when jsonb_typeof(tab->'blocks') = 'array'
      then tab->'blocks' else '[]'::jsonb end) with ordinality as block(value, ordinality)
    where not exists (select 1 from jsonb_array_elements(managed_fields) field where field->>'field' = block.value->>'field');
    select value into candidate from jsonb_array_elements(managed_tabs) where value->>'key' = tab->>'key';
    if candidate is not null then
      tab := tab || candidate || jsonb_build_object('blocks', blocks || (candidate->'blocks'));
    else
      tab := tab || jsonb_build_object('blocks', blocks);
    end if;
    tabs := tabs || jsonb_build_array(tab);
  end loop;
  for candidate in select value from jsonb_array_elements(managed_tabs) loop
    if not exists (select 1 from jsonb_array_elements(tabs) where value->>'key' = candidate->>'key') then
      tabs := tabs || jsonb_build_array(candidate);
    end if;
  end loop;

  definition := jsonb_set(definition, '{fields}', fields);
  definition := jsonb_set(definition, '{layout}', jsonb_set(form_layout, array[tabs_index::text,'tabs'], tabs));
  update public.lowcode_form_definitions set schema = definition, updated_at = timezone('utc', now())
  where code = 'material-prop.array-table';
end;
$$;

select pg_notify('pgrst', 'reload schema');
commit;
