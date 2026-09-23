-- Database-backed low-code schema for the print designer background panel.
begin;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled,
  updated_at
) values (
  'print-designer.background',
  '打印设计器 - 背景设置',
  '打印设计器当前画布页面的背景色、背景图和填充方式。',
  $schema$
  {
    "title": "背景设置",
    "columns": 1,
    "fields": [
      {"field":"color","label":"背景色","component":"lc-color-picker"},
      {"field":"imageUrl","label":"背景图地址","component":"vxe-input","props":{"clearable":true,"placeholder":"粘贴图片地址，或使用上传图片"}},
      {"field":"imageSize","label":"填充方式","component":"vxe-select","options":[{"label":"铺满","value":"cover"},{"label":"完整显示","value":"contain"},{"label":"原始尺寸","value":"auto"}],"props":{"clearable":false}},
      {"field":"imagePosition","label":"图片位置","component":"vxe-input","props":{"placeholder":"例如 center、top left"}}
    ],
    "actions": []
  }
  $schema$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');

commit;
