begin;

-- The material table column editor is a database-owned low-code form so it can
-- evolve with the other print-designer property forms without a frontend deploy.
insert into public.lowcode_form_definitions (code, name, description, table_name, schema, enabled)
values (
  'print-designer.property.vue-material-column',
  '物料表格列属性',
  '打印设计器物料表格单列设计表单。',
  null,
  jsonb_build_object(
    'title', '物料表格列属性',
    'columns', 1,
    'fields', jsonb_build_array(
      jsonb_build_object('field', 'field', 'label', '字段名', 'component', 'vxe-input', 'props', jsonb_build_object('disabled', true)),
      jsonb_build_object('field', 'title', 'label', '列标题', 'component', 'vxe-input'),
      jsonb_build_object('field', 'width', 'label', '列宽', 'component', 'lc-number-input', 'props', jsonb_build_object('min', 36, 'step', 1)),
      jsonb_build_object('field', 'visible', 'label', '显示列', 'component', 'vxe-switch', 'defaultValue', true),
      jsonb_build_object('field', 'align', 'label', '内容对齐', 'component', 'vxe-select', 'options', jsonb_build_array(
        jsonb_build_object('label', '默认', 'value', ''),
        jsonb_build_object('label', '居左', 'value', 'left'),
        jsonb_build_object('label', '居中', 'value', 'center'),
        jsonb_build_object('label', '居右', 'value', 'right')
      )),
      jsonb_build_object('field', 'headerAlign', 'label', '表头对齐', 'component', 'vxe-select', 'options', jsonb_build_array(
        jsonb_build_object('label', '默认', 'value', ''),
        jsonb_build_object('label', '居左', 'value', 'left'),
        jsonb_build_object('label', '居中', 'value', 'center'),
        jsonb_build_object('label', '居右', 'value', 'right')
      )),
      jsonb_build_object('field', 'component', 'label', '单元格组件', 'component', 'vxe-input'),
      jsonb_build_object('field', 'props', 'label', '组件属性', 'component', 'lc-json-editor', 'props', jsonb_build_object('jsonValueMode', 'string', 'jsonRootType', 'object')),
      jsonb_build_object('field', 'formatter', 'label', '格式化配置', 'component', 'lc-json-editor', 'props', jsonb_build_object('jsonValueMode', 'string'))
    ),
    'layout', jsonb_build_array(jsonb_build_object(
      'kind', 'tabs',
      'defaultKey', 'basic',
      'tabs', jsonb_build_array(
        jsonb_build_object('key', 'basic', 'label', '基本属性', 'blocks', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'field', 'field'),
          jsonb_build_object('kind', 'field', 'field', 'title'),
          jsonb_build_object('kind', 'field', 'field', 'width'),
          jsonb_build_object('kind', 'field', 'field', 'visible'),
          jsonb_build_object('kind', 'field', 'field', 'align'),
          jsonb_build_object('kind', 'field', 'field', 'headerAlign')
        )),
        jsonb_build_object('key', 'advanced', 'label', '高级属性', 'blocks', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'field', 'component'),
          jsonb_build_object('kind', 'field', 'field', 'props'),
          jsonb_build_object('kind', 'field', 'field', 'formatter')
        ))
      )
    )),
    'actions', jsonb_build_array()
  ),
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());

commit;
