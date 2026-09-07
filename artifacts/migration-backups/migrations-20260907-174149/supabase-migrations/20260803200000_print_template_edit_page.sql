-- Add the low-code print-template edit page and link it from the template list page.

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  page_type,
  schema,
  version,
  published_at
) values (
  'print-templates-edit',
  '/dashboard/print/templates/edit',
  U&'\6253\5370\6A21\677F\7F16\8F91',
  U&'\7F16\8F91\6253\5370\6A21\677F\540D\79F0\548C\72B6\6001\3002',
  'dashboard',
  'published',
  false,
  'edit',
  $json$
  {
    "schemaVersion": 1,
    "code": "print-templates-edit",
    "route": "/dashboard/print/templates/edit",
    "title": "打印模板编辑",
    "description": "编辑打印模板名称和状态。",
    "pageType": "edit",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "dataSources": {},
    "blocks": [
      {
        "id": "print-templates-edit-form",
        "kind": "form",
        "initialValues": {
          "id": "",
          "name": "",
          "status": "active",
          "version": 1,
          "content": {},
          "workspace": {},
          "metadata": {}
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "name",
              "label": "模板名称",
              "component": "vxe-input",
              "span": 2,
              "props": {
                "maxlength": 120,
                "clearable": true,
                "placeholder": "请输入模板名称"
              },
              "rules": [
                {
                  "required": true,
                  "message": "模板名称不能为空"
                }
              ]
            },
            {
              "field": "status",
              "label": "状态",
              "component": "vxe-select",
              "options": [
                { "label": "草稿", "value": "draft" },
                { "label": "启用", "value": "active" },
                { "label": "已归档", "value": "archived" }
              ]
            },
            {
              "field": "version",
              "label": "当前版本",
              "component": "lc-number-input",
              "props": {
                "disabled": true,
                "min": 1,
                "digits": 0
              }
            }
          ],
          "actions": [
            {
              "code": "submit",
              "label": "保存",
              "type": "submit",
              "status": "primary"
            },
            {
              "code": "reset",
              "label": "重置",
              "type": "reset"
            }
          ]
        }
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  page_type = excluded.page_type,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  id,
  version,
  schema,
  published_at
from public.lowcode_pages
where code = 'print-templates-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages as list_page
set
  edit_page_id = edit_page.id,
  updated_at = timezone('utc'::text, now())
from public.lowcode_pages as edit_page
where list_page.code = 'print-templates'
  and edit_page.code = 'print-templates-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

select pg_notify('pgrst', 'reload schema');
