-- The standalone print account page keeps its editable form definition in the
-- low-code registry so field labels, validation, and layout remain database-driven.
insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  table_name,
  schema,
  enabled,
  updated_at
)
values (
  'print-account-setting',
  '打印设计器账号设置',
  '打印设计器独立账号设置页使用的低代码表单。',
  null,
  $$
  {
    "title": "基本信息",
    "columns": 1,
    "fields": [
      {
        "field": "fullName",
        "label": "显示名称",
        "component": "vxe-input",
        "props": {
          "placeholder": "请输入显示名称",
          "clearable": true,
          "maxlength": 80
        },
        "rules": [
          {"required": true, "message": "请输入显示名称"}
        ]
      },
      {
        "field": "email",
        "label": "登录邮箱",
        "component": "vxe-input",
        "props": {
          "type": "email",
          "placeholder": "name@example.com",
          "clearable": true
        },
        "rules": [
          {"required": true, "message": "请输入登录邮箱"}
        ]
      }
    ],
    "layout": [
      {
        "kind": "row",
        "columns": [
          {
            "span": 12,
            "blocks": [{"kind": "field", "field": "fullName"}]
          },
          {
            "span": 12,
            "blocks": [{"kind": "field", "field": "email"}]
          }
        ]
      }
    ],
    "actions": []
  }
  $$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());
