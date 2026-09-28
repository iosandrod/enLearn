begin;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'print-designer.style',
  '打印设计器样式表单',
  '打印设计器左侧样式面板的低代码表单定义。',
  jsonb_build_object(
    'title', '样式配置',
    'columns', 1,
    'fields', jsonb_build_array(
      jsonb_build_object(
        'field', 'color',
        'label', '颜色',
        'component', 'vxe-select',
        'options', jsonb_build_array(
          jsonb_build_object('label', '黑色', 'value', 'black'),
          jsonb_build_object('label', '灰色', 'value', 'grey'),
          jsonb_build_object('label', '浅紫色', 'value', 'light-violet'),
          jsonb_build_object('label', '紫色', 'value', 'violet'),
          jsonb_build_object('label', '蓝色', 'value', 'blue'),
          jsonb_build_object('label', '浅蓝色', 'value', 'light-blue'),
          jsonb_build_object('label', '黄色', 'value', 'yellow'),
          jsonb_build_object('label', '橙色', 'value', 'orange'),
          jsonb_build_object('label', '绿色', 'value', 'green'),
          jsonb_build_object('label', '浅绿色', 'value', 'light-green'),
          jsonb_build_object('label', '浅红色', 'value', 'light-red'),
          jsonb_build_object('label', '红色', 'value', 'red')
        )
      ),
      jsonb_build_object(
        'field', 'fill',
        'label', '填充',
        'component', 'vxe-select',
        'options', jsonb_build_array(
          jsonb_build_object('label', '无填充', 'value', 'none'),
          jsonb_build_object('label', '半透明', 'value', 'semi'),
          jsonb_build_object('label', '实心', 'value', 'solid'),
          jsonb_build_object('label', '图案', 'value', 'pattern')
        )
      ),
      jsonb_build_object(
        'field', 'dash',
        'label', '线条',
        'component', 'vxe-select',
        'options', jsonb_build_array(
          jsonb_build_object('label', '手绘', 'value', 'draw'),
          jsonb_build_object('label', '虚线', 'value', 'dashed'),
          jsonb_build_object('label', '点线', 'value', 'dotted'),
          jsonb_build_object('label', '实线', 'value', 'solid')
        )
      ),
      jsonb_build_object(
        'field', 'size',
        'label', '大小',
        'component', 'vxe-select',
        'options', jsonb_build_array(
          jsonb_build_object('label', '小', 'value', 's'),
          jsonb_build_object('label', '中', 'value', 'm'),
          jsonb_build_object('label', '大', 'value', 'l'),
          jsonb_build_object('label', '超大', 'value', 'xl')
        )
      ),
      jsonb_build_object(
        'field', 'opacity',
        'label', '透明度',
        'component', 'vxe-select',
        'options', jsonb_build_array(
          jsonb_build_object('label', '10%', 'value', 0.1),
          jsonb_build_object('label', '25%', 'value', 0.25),
          jsonb_build_object('label', '50%', 'value', 0.5),
          jsonb_build_object('label', '75%', 'value', 0.75),
          jsonb_build_object('label', '100%', 'value', 1)
        )
      )
    ),
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
