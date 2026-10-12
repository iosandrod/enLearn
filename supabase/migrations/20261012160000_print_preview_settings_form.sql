begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.preview-settings',
  '打印设计器 - 预览设置',
  '设置预览按物料表格组件分页，或按所选明细源逐条分页。',
  null,
  $schema$
  {
    "title": "预览设置",
    "columns": 1,
    "fields": [
      {
        "field": "mode", "label": "分页模式", "component": "vxe-select",
        "defaultValue": "component",
        "options": [{"label": "组件模式", "value": "component"}, {"label": "数据模式", "value": "data"}],
        "props": {"clearable": false}
      },
      {
        "field": "materialId", "label": "物料表格组件", "component": "vxe-select", "options": [],
        "props": {"clearable": false, "placeholder": "选择当前画布的物料表格", "visibleWhen": {"field": "mode", "equals": "component"}}
      },
      {
        "field": "detailField", "label": "明细源", "component": "vxe-select", "options": [],
        "props": {"clearable": false, "placeholder": "选择相关的明细源", "visibleWhen": {"field": "mode", "equals": "data"}}
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true,
  null
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');
commit;
