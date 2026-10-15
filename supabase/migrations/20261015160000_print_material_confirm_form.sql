begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.material-save',
  '另存为素材',
  '打印设计器将选中节点或上传图片另存为可复用素材时使用的属性表单。',
  null,
  $schema$
  {
    "title": "另存为素材",
    "columns": 2,
    "fields": [
      {
        "field": "name",
        "label": "素材名称",
        "span": 2,
        "component": "vxe-input",
        "props": {"clearable": true, "placeholder": "请输入素材名称"},
        "rules": [{"required": true, "message": "请输入素材名称"}]
      },
      {
        "field": "materialType",
        "label": "素材类型",
        "span": 1,
        "component": "vxe-select",
        "props": {"clearable": false, "disabled": true},
        "options": [
          {"label": "图片素材", "value": "image"},
          {"label": "单节点素材", "value": "node"},
          {"label": "多节点组合素材", "value": "group"}
        ],
        "rules": [{"required": true, "message": "素材类型不能为空"}]
      },
      {
        "field": "accessLevel",
        "label": "访问级别",
        "span": 1,
        "component": "vxe-select",
        "props": {"clearable": false},
        "options": [
          {"label": "免费", "value": "free"},
          {"label": "专业版", "value": "pro"},
          {"label": "企业版", "value": "enterprise"}
        ],
        "rules": [{"required": true, "message": "请选择访问级别"}]
      },
      {
        "field": "category",
        "label": "素材分类",
        "span": 1,
        "component": "vxe-input",
        "props": {"clearable": true, "placeholder": "例如：页眉、标签、品牌"}
      },
      {
        "field": "tags",
        "label": "标签",
        "span": 1,
        "component": "vxe-input",
        "props": {"clearable": true, "placeholder": "多个标签使用逗号分隔"}
      },
      {
        "field": "description",
        "label": "素材说明",
        "span": 2,
        "component": "vxe-textarea",
        "props": {"clearable": true, "rows": 3, "placeholder": "说明素材用途或使用场景"}
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
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');

commit;
