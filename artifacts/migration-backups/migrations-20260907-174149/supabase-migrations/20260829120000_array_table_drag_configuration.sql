-- Persist array-table drag behavior in database-owned form definitions.

begin;

-- Existing installations already have the master grid-designer definition. Repair the
-- nested column-table schema so the dedicated drag-sort column has a valid VXE trigger.
with target as (
  select id, schema
  from public.lowcode_form_definitions
  where code = 'grid-designer'
),
column_table as (
  select
    target.id,
    target.schema,
    section_field.ordinality - 1 as section_index,
    columns_field.ordinality - 1 as columns_index,
    columns_field.value -> 'props' as columns_props
  from target
  cross join lateral jsonb_array_elements(
    coalesce(target.schema -> 'fields', '[]'::jsonb)
  ) with ordinality as section_field(value, ordinality)
  cross join lateral jsonb_array_elements(
    coalesce(section_field.value #> '{props,schema,fields}', '[]'::jsonb)
  ) with ordinality as columns_field(value, ordinality)
  where section_field.value ->> 'field' = 'grid-designer-columns'
    and columns_field.value ->> 'field' = 'columns'
)
update public.lowcode_form_definitions as definition
set schema = jsonb_set(
  column_table.schema,
  array[
    'fields',
    column_table.section_index::text,
    'props',
    'schema',
    'fields',
    column_table.columns_index::text,
    'props'
  ],
  coalesce(column_table.columns_props, '{}'::jsonb) || jsonb_build_object(
    'rowDraggable', true,
    'rowDragConfig', jsonb_build_object(
      'trigger', 'cell',
      'showIcon', true,
      'animation', true,
      'showGuidesStatus', true,
      'showDragTip', true
    ),
    'movable', false
  ),
  true
)
from column_table
where definition.id = column_table.id;

-- Array-table is a form input material. Its public drag options must be editable from
-- the database-owned property form rather than only being available to bundled schemas.
with drag_fields as (
  select jsonb_build_array(
    jsonb_build_object(
      'field', 'rowDraggable',
      'target', 'props',
      'path', 'rowDraggable',
      'label', '启用拖拽排序',
      'component', 'vxe-switch',
      'valueKind', 'boolean',
      'defaultValue', false,
      'help', '开启后可通过表格左侧拖拽手柄调整数组顺序。'
    ),
    jsonb_build_object(
      'field', 'rowDragConfig',
      'target', 'props',
      'path', 'rowDragConfig',
      'label', '拖拽配置',
      'component', 'lc-sub-form',
      'valueKind', 'raw',
      'defaultValue', jsonb_build_object(
        'trigger', 'cell',
        'showIcon', true,
        'animation', true,
        'showGuidesStatus', true,
        'showDragTip', true
      ),
      'props', jsonb_build_object(
        'schema', jsonb_build_object(
          'columns', 2,
          'fields', jsonb_build_array(
            jsonb_build_object(
              'field', 'trigger',
              'label', '触发区域',
              'component', 'lc-option-select',
              'valueKind', 'raw',
              'defaultValue', 'cell',
              'options', jsonb_build_array(
                jsonb_build_object('label', '拖拽手柄列', 'value', 'cell', 'rawValue', 'cell'),
                jsonb_build_object('label', '整行', 'value', 'row', 'rawValue', 'row')
              )
            ),
            jsonb_build_object(
              'field', 'animation',
              'label', '拖拽动画',
              'component', 'vxe-switch',
              'valueKind', 'boolean',
              'defaultValue', true
            ),
            jsonb_build_object(
              'field', 'showIcon',
              'label', '显示拖拽图标',
              'component', 'vxe-switch',
              'valueKind', 'boolean',
              'defaultValue', true
            ),
            jsonb_build_object(
              'field', 'showGuidesStatus',
              'label', '显示放置引导',
              'component', 'vxe-switch',
              'valueKind', 'boolean',
              'defaultValue', true
            ),
            jsonb_build_object(
              'field', 'showDragTip',
              'label', '显示拖拽提示',
              'component', 'vxe-switch',
              'valueKind', 'boolean',
              'defaultValue', true
            )
          ),
          'layout', '[]'::jsonb,
          'actions', '[]'::jsonb
        )
      )
    )
  ) as fields,
  jsonb_build_object(
    'key', 'drag',
    'label', '拖拽排序',
    'blocks', jsonb_build_array(
      jsonb_build_object('kind', 'field', 'field', 'rowDraggable'),
      jsonb_build_object('kind', 'field', 'field', 'rowDragConfig')
    )
  ) as tab
),
target as (
  select id, schema
  from public.lowcode_form_definitions
  where code = 'material-prop.array-table'
),
next_schema as (
  select
    target.id,
    jsonb_set(
      jsonb_set(
        target.schema,
        '{fields}',
        coalesce(target.schema -> 'fields', '[]'::jsonb) || coalesce(
          (
            select jsonb_agg(candidate.value)
            from jsonb_array_elements(drag_fields.fields) as candidate(value)
            where not exists (
              select 1
              from jsonb_array_elements(
                coalesce(target.schema -> 'fields', '[]'::jsonb)
              ) as existing_field(value)
              where existing_field.value ->> 'field' = candidate.value ->> 'field'
            )
          ),
          '[]'::jsonb
        ),
        true
      ),
      '{layout,0,tabs}',
      coalesce(target.schema #> '{layout,0,tabs}', '[]'::jsonb) || case
        when exists (
          select 1
          from jsonb_array_elements(
            coalesce(target.schema #> '{layout,0,tabs}', '[]'::jsonb)
          ) as existing_tab(value)
          where existing_tab.value ->> 'key' = drag_fields.tab ->> 'key'
        ) then '[]'::jsonb
        else jsonb_build_array(drag_fields.tab)
      end,
      true
    ) as schema
  from target
  cross join drag_fields
)
update public.lowcode_form_definitions as definition
set schema = next_schema.schema
from next_schema
where definition.id = next_schema.id;

commit;
