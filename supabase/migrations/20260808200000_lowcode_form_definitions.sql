create table if not exists public.lowcode_form_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  schema jsonb not null,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint lowcode_form_definitions_code_check
    check (code ~ '^[a-z][a-z0-9._-]*$'),
  constraint lowcode_form_definitions_schema_check
    check (
      jsonb_typeof(schema) = 'object'
      and schema ? 'fields'
      and jsonb_typeof(schema -> 'fields') = 'array'
      and schema ? 'actions'
      and jsonb_typeof(schema -> 'actions') = 'array'
    )
);

drop trigger if exists set_lowcode_form_definitions_updated_at
  on public.lowcode_form_definitions;
create trigger set_lowcode_form_definitions_updated_at
before update on public.lowcode_form_definitions
for each row execute function public.set_updated_at();

alter table public.lowcode_form_definitions enable row level security;

drop policy if exists "Permission holders can manage low-code form definitions"
  on public.lowcode_form_definitions;
create policy "Permission holders can manage low-code form definitions"
on public.lowcode_form_definitions for all to authenticated
using (public.has_app_permission('lowcode.pages.manage'))
with check (public.has_app_permission('lowcode.pages.manage'));

grant select, insert, update, delete
  on public.lowcode_form_definitions to authenticated, service_role;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'page-info-design',
  '页面信息设计',
  '维护低代码页面基础信息、页面函数和页面 API。',
  $schema$
  {
    "columns": 2,
    "fields": [
      {
        "field": "code",
        "label": "页面编码",
        "component": "vxe-input",
        "props": { "readonly": true }
      },
      {
        "field": "route",
        "label": "后台路由",
        "component": "vxe-input",
        "props": { "readonly": true }
      },
      {
        "field": "title",
        "label": "页面标题",
        "component": "vxe-input",
        "props": { "clearable": true },
        "rules": [
          { "required": true, "message": "页面标题不能为空" }
        ],
        "span": 2
      },
      {
        "field": "pageType",
        "label": "页面类型",
        "component": "vxe-select",
        "options": [
          { "label": "列表页", "value": "list" },
          { "label": "编辑页", "value": "edit" },
          { "label": "详情页", "value": "detail" },
          { "label": "自定义页", "value": "custom" }
        ]
      },
      {
        "field": "layout",
        "label": "页面布局",
        "component": "vxe-select",
        "options": [
          { "label": "后台布局", "value": "dashboard" },
          { "label": "默认布局", "value": "default" },
          { "label": "空白布局", "value": "blank" }
        ]
      },
      {
        "field": "status",
        "label": "状态",
        "component": "vxe-select",
        "options": [
          { "label": "草稿", "value": "draft" },
          { "label": "已发布", "value": "published" },
          { "label": "已归档", "value": "archived" }
        ]
      },
      {
        "field": "keepAlive",
        "label": "保持页面状态",
        "component": "vxe-switch",
        "props": { "openLabel": "开启", "closeLabel": "关闭" }
      },
      {
        "field": "description",
        "label": "页面说明",
        "component": "vxe-textarea",
        "props": { "rows": 4, "resize": "vertical" },
        "span": 2
      },
      {
        "field": "functions",
        "label": "页面函数",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "rowKey": "name",
          "height": 390,
          "minHeight": 280,
          "movable": true,
          "removable": true,
          "toolbarButtons": [
            {
              "code": "add",
              "label": "新增函数",
              "command": "add",
              "status": "primary",
              "prefixIcon": "ri-add-line"
            }
          ],
          "defaultRow": {
            "name": "pageFunction{{index}}",
            "label": "页面函数 {{index}}",
            "description": "",
            "enabled": true,
            "script": "async function main() {\n  return this.event.args;\n}"
          },
          "columns": [
            {
              "field": "name",
              "title": "函数名",
              "component": "vxe-input",
              "minWidth": 170,
              "placeholder": "analyzeColumns"
            },
            {
              "field": "label",
              "title": "显示名称",
              "component": "vxe-input",
              "minWidth": 150,
              "placeholder": "分析字段"
            },
            {
              "field": "description",
              "title": "说明",
              "component": "vxe-input",
              "minWidth": 210,
              "placeholder": "函数用途和返回值"
            },
            {
              "field": "enabled",
              "title": "启用",
              "component": "vxe-switch",
              "width": 72
            },
            {
              "field": "script",
              "title": "函数脚本",
              "component": "lc-monaco-editor",
              "minWidth": 260,
              "placeholder": "async function main() { ... }",
              "props": {
                "dialog": true,
                "dialogTitle": "编辑页面函数",
                "language": "javascript",
                "scriptThisType": "LowCodeButtonScriptThis",
                "contextDrawer": true,
                "contextDrawerTitle": "当前页面上下文",
                "editorHeight": "min(500px, calc(100vh - 250px))"
              }
            }
          ]
        }
      },
      {
        "field": "apis",
        "label": "页面 API",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "rowKey": "name",
          "height": 390,
          "minHeight": 280,
          "toolbarButtons": [
            {
              "code": "add",
              "label": "新增 API",
              "command": "add",
              "status": "primary",
              "prefixIcon": "ri-add-line"
            }
          ],
          "defaultRow": {
            "name": "pageApi{{index}}",
            "serviceName": "",
            "serviceMethod": "",
            "method": "POST",
            "resultPath": "",
            "postData": {}
          },
          "columns": [
            {
              "field": "name",
              "title": "API 别名",
              "minWidth": 160,
              "placeholder": "analyzeViewSql"
            },
            {
              "field": "serviceName",
              "title": "服务名",
              "minWidth": 150,
              "placeholder": "entityDesign"
            },
            {
              "field": "serviceMethod",
              "title": "服务方法",
              "minWidth": 180,
              "placeholder": "validateView"
            },
            {
              "field": "method",
              "title": "方法",
              "component": "vxe-select",
              "width": 100,
              "options": [
                { "label": "GET", "value": "GET" },
                { "label": "POST", "value": "POST" },
                { "label": "PUT", "value": "PUT" },
                { "label": "PATCH", "value": "PATCH" },
                { "label": "DELETE", "value": "DELETE" }
              ]
            },
            {
              "field": "resultPath",
              "title": "结果路径",
              "minWidth": 140,
              "placeholder": "columns"
            },
            {
              "field": "postData",
              "title": "固定参数",
              "component": "lc-json-editor",
              "minWidth": 210,
              "props": {
                "dialogTitle": "编辑 API 固定参数",
                "jsonRootType": "object",
                "jsonValueMode": "parsed"
              }
            }
          ]
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础信息",
            "blocks": [
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "code" }]
                  },
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "route" }]
                  }
                ]
              },
              { "kind": "field", "field": "title" },
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "pageType" }]
                  },
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "layout" }]
                  }
                ]
              },
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "status" }]
                  },
                  {
                    "span": 12,
                    "blocks": [{ "kind": "field", "field": "keepAlive" }]
                  }
                ]
              },
              { "kind": "field", "field": "description" }
            ]
          },
          {
            "key": "functions",
            "label": "页面函数",
            "blocks": [{ "kind": "field", "field": "functions" }]
          },
          {
            "key": "apis",
            "label": "页面 API",
            "blocks": [{ "kind": "field", "field": "apis" }]
          }
        ]
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do nothing;

comment on table public.lowcode_form_definitions is
  'Database-driven LowCodeForm schema definitions used by administrative editors.';
