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

drop policy if exists "Authenticated users can read enabled low-code form definitions"
  on public.lowcode_form_definitions;
create policy "Authenticated users can read enabled low-code form definitions"
on public.lowcode_form_definitions for select to authenticated
using (enabled);

grant select, insert, update, delete
  on public.lowcode_form_definitions to authenticated, service_role;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'account-profile',
  '账户资料 - 个人信息',
  '账户个人资料编辑表单。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "fullName",
        "label": "Full Name",
        "component": "vxe-input",
        "props": { "placeholder": "Enter your full name", "clearable": true }
      }
    ],
    "actions": [
      { "code": "submit", "label": "Update Name", "type": "submit", "status": "primary" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'account-email',
  '账户资料 - 邮箱',
  '账户邮箱编辑表单。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "email",
        "label": "Email",
        "component": "vxe-input",
        "props": { "placeholder": "name@example.com", "type": "email", "clearable": true },
        "rules": [{ "required": true, "message": "Email is required" }]
      }
    ],
    "actions": [
      { "code": "submit", "label": "Update Email", "type": "submit", "status": "primary" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'dashboard-settings',
  '控制台偏好设置',
  '控制台通知、语言和主题设置表单。',
  $schema$
  {
    "columns": 2,
    "fields": [
      {
        "field": "notifyEverything",
        "label": "Everything",
        "component": "vxe-switch",
        "help": "Email digest, mentions and all activity."
      },
      {
        "field": "notifyAvailable",
        "label": "Available",
        "component": "vxe-switch",
        "help": "Only mentions and comments."
      },
      {
        "field": "notifyIgnoring",
        "label": "Ignoring",
        "component": "vxe-switch",
        "help": "Turn off all notifications."
      },
      {
        "field": "language",
        "label": "Language",
        "component": "vxe-select",
        "options": [
          { "label": "English", "value": "en" },
          { "label": "Spanish", "value": "es" }
        ]
      },
      {
        "field": "theme",
        "label": "Theme",
        "component": "vxe-select",
        "options": [
          { "label": "Light", "value": "light" },
          { "label": "Dark", "value": "dark" },
          { "label": "System", "value": "system" }
        ]
      },
      {
        "field": "font",
        "label": "Font",
        "component": "vxe-select",
        "options": [
          { "label": "Sans Serif", "value": "sans" },
          { "label": "Serif", "value": "serif" },
          { "label": "Monospace", "value": "mono" }
        ]
      }
    ],
    "actions": [
      { "code": "submit", "label": "Save Settings", "type": "submit", "status": "primary" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'post-editor',
  '文章编辑',
  '文章标题和正文编辑表单。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "title",
        "label": "Post Title",
        "component": "vxe-input",
        "props": { "placeholder": "Enter a post title", "clearable": true },
        "rules": [{ "required": true, "message": "Post title is required" }]
      },
      {
        "field": "content",
        "label": "Post Content",
        "component": "vxe-textarea",
        "props": { "placeholder": "Write something", "rows": 4, "resize": "vertical" }
      }
    ],
    "actions": [
      { "code": "submit", "label": "Save Post", "type": "submit", "status": "primary" },
      { "code": "reset", "label": "Reset", "type": "reset" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'lowcode-page-editor',
  '低代码页面编辑',
  '低代码页面元数据和 Schema 编辑表单。',
  $schema$
  {
    "columns": 2,
    "fields": [
      {
        "field": "code",
        "label": "Page Code",
        "component": "vxe-input",
        "props": { "placeholder": "dashboard-lowcode-demo", "clearable": true },
        "rules": [{ "required": true, "message": "Code is required" }]
      },
      {
        "field": "route",
        "label": "Route",
        "component": "vxe-input",
        "props": { "placeholder": "/dashboard/low-code/demo", "clearable": true },
        "rules": [{ "required": true, "message": "Route is required" }]
      },
      {
        "field": "title",
        "label": "Title",
        "component": "vxe-input",
        "props": { "placeholder": "Demo Admin Page", "clearable": true },
        "rules": [{ "required": true, "message": "Title is required" }]
      },
      {
        "field": "pageType",
        "label": "Page Type",
        "component": "vxe-select",
        "options": [
          { "label": "Custom", "value": "custom" },
          { "label": "List Page", "value": "list" },
          { "label": "Edit Page", "value": "edit" },
          { "label": "Detail Page", "value": "detail" }
        ]
      },
      {
        "field": "layout",
        "label": "Layout",
        "component": "vxe-select",
        "options": [
          { "label": "Default", "value": "default" },
          { "label": "Dashboard", "value": "dashboard" },
          { "label": "Blank", "value": "blank" }
        ]
      },
      {
        "field": "status",
        "label": "Status",
        "component": "vxe-select",
        "options": [
          { "label": "Draft", "value": "draft" },
          { "label": "Published", "value": "published" },
          { "label": "Archived", "value": "archived" }
        ]
      },
      { "field": "keep_alive", "label": "Keep Alive", "component": "vxe-switch" },
      {
        "field": "parentListPageCode",
        "label": "Parent List Page",
        "component": "vxe-input",
        "props": { "placeholder": "Required when Page Type is Edit Page", "clearable": true },
        "span": 2
      },
      {
        "field": "description",
        "label": "Description",
        "component": "vxe-textarea",
        "props": { "placeholder": "Describe what this page is for", "rows": 3, "resize": "vertical" },
        "span": 2
      },
      {
        "field": "schemaJson",
        "label": "Schema JSON",
        "component": "lc-json-editor",
        "props": {
          "placeholder": "Paste the page schema JSON here",
          "rows": 16,
          "jsonRootType": "object",
          "jsonValueMode": "string"
        },
        "rules": [{ "required": true, "message": "Schema JSON is required" }],
        "span": 2
      }
    ],
    "actions": [
      { "code": "save", "label": "Save Page", "type": "submit", "status": "primary" },
      { "code": "publish", "label": "Publish", "type": "button" },
      { "code": "archive", "label": "Archive", "type": "button", "status": "warning" },
      { "code": "reset", "label": "Reset", "type": "reset" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-table',
  '实体设计 - 表',
  '实体表基础信息编辑表单。',
  $schema$
  {
    "title": "表格实体",
    "columns": 2,
    "fields": [
      {
        "field": "code",
        "label": "实体编码",
        "component": "vxe-input",
        "props": { "placeholder": "sale", "clearable": true },
        "rules": [{ "required": true, "message": "请输入实体编码" }]
      },
      {
        "field": "tableName",
        "label": "真实表名",
        "component": "vxe-input",
        "props": { "placeholder": "public.sale", "clearable": true },
        "rules": [{ "required": true, "message": "请输入真实表名" }]
      },
      {
        "field": "title",
        "label": "显示名称",
        "component": "vxe-input",
        "props": { "placeholder": "销售订单", "clearable": true },
        "rules": [{ "required": true, "message": "请输入显示名称" }]
      },
      {
        "field": "primaryKey",
        "label": "主键列",
        "component": "vxe-input",
        "props": { "placeholder": "id", "clearable": true }
      },
      {
        "field": "description",
        "label": "业务说明",
        "component": "vxe-textarea",
        "props": { "placeholder": "说明这张表的业务含义和使用边界", "rows": 3, "resize": "vertical" }
      },
      {
        "field": "createPhysical",
        "label": "同步创建真实表",
        "component": "vxe-switch",
        "help": "关闭后只保存 metadata，不执行 create table。"
      }
    ],
    "layout": [
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "code" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "tableName" }] }
        ]
      },
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "title" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "primaryKey" }] }
        ]
      },
      { "kind": "field", "field": "description" },
      { "kind": "field", "field": "createPhysical" }
    ],
    "actions": [
      { "code": "save", "label": "保存表", "type": "submit", "status": "primary" },
      { "code": "delete", "label": "删除 metadata", "type": "button", "status": "danger" },
      { "code": "reset", "label": "新建表", "type": "button" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-column',
  '实体设计 - 字段',
  '实体字段编辑表单。',
  $schema$
  {
    "title": "列设计",
    "columns": 2,
    "fields": [
      {
        "field": "columnName",
        "label": "列名",
        "component": "vxe-input",
        "props": { "placeholder": "sale_no", "clearable": true },
        "rules": [{ "required": true, "message": "请输入列名" }]
      },
      {
        "field": "label",
        "label": "列标题",
        "component": "vxe-input",
        "props": { "placeholder": "订单编号", "clearable": true }
      },
      {
        "field": "dataType",
        "label": "数据类型",
        "component": "vxe-select",
        "options": [
          { "label": "uuid", "value": "uuid" },
          { "label": "text", "value": "text" },
          { "label": "varchar", "value": "varchar" },
          { "label": "integer", "value": "integer" },
          { "label": "bigint", "value": "bigint" },
          { "label": "numeric", "value": "numeric" },
          { "label": "boolean", "value": "boolean" },
          { "label": "date", "value": "date" },
          { "label": "timestamptz", "value": "timestamptz" },
          { "label": "jsonb", "value": "jsonb" }
        ]
      },
      {
        "field": "storageKind",
        "label": "存储方式",
        "component": "vxe-select",
        "options": [
          { "label": "真实列", "value": "physical" },
          { "label": "虚拟列", "value": "virtual" }
        ],
        "help": "虚拟列只进入设计 metadata，不强制落到真实表。"
      },
      {
        "field": "defaultValue",
        "label": "默认值 SQL",
        "component": "vxe-input",
        "props": { "placeholder": "'draft' / 0 / now()", "clearable": true }
      },
      {
        "field": "expression",
        "label": "虚拟表达式",
        "component": "vxe-textarea",
        "props": { "placeholder": "quantity * unit_price", "rows": 2, "resize": "vertical" }
      },
      { "field": "isRequired", "label": "必填", "component": "vxe-switch" },
      { "field": "isUnique", "label": "唯一", "component": "vxe-switch" }
    ],
    "layout": [
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "columnName" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "label" }] }
        ]
      },
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "dataType" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "storageKind" }] }
        ]
      },
      { "kind": "field", "field": "defaultValue" },
      { "kind": "field", "field": "expression" },
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "isRequired" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "isUnique" }] }
        ]
      }
    ],
    "actions": [
      { "code": "save", "label": "保存列", "type": "submit", "status": "primary" },
      { "code": "delete", "label": "删除列", "type": "button", "status": "danger" },
      { "code": "reset", "label": "新建列", "type": "button" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-columns',
  '实体设计 - 字段集合',
  '实体字段集合编辑表单。',
  $schema$
  {
    "title": "字段集合",
    "columns": 1,
    "fields": [
      {
        "field": "columns",
        "label": "字段列表",
        "component": "lc-array-table",
        "help": "在表格中维护字段集合；点击画布字段或编辑表格行时，下方单列表单会同步绑定当前字段。",
        "props": {
          "toolbarButtons": [
            { "code": "add", "label": "新增列", "command": "add", "status": "primary" }
          ],
          "rowKey": "columnName",
          "defaultRow": {
            "id": "",
            "columnName": "",
            "label": "",
            "dataType": "text",
            "storageKind": "physical",
            "defaultValue": "",
            "expression": "",
            "isRequired": false,
            "isUnique": false
          },
          "columns": [
            {
              "field": "columnName",
              "title": "列名",
              "component": "vxe-input",
              "minWidth": 126,
              "placeholder": "sale_no"
            },
            {
              "field": "label",
              "title": "标题",
              "component": "vxe-input",
              "minWidth": 120,
              "placeholder": "订单编号"
            },
            {
              "field": "dataType",
              "title": "类型",
              "component": "vxe-select",
              "width": 120,
              "options": [
                { "label": "uuid", "value": "uuid" },
                { "label": "text", "value": "text" },
                { "label": "varchar", "value": "varchar" },
                { "label": "integer", "value": "integer" },
                { "label": "bigint", "value": "bigint" },
                { "label": "numeric", "value": "numeric" },
                { "label": "boolean", "value": "boolean" },
                { "label": "date", "value": "date" },
                { "label": "timestamptz", "value": "timestamptz" },
                { "label": "jsonb", "value": "jsonb" }
              ]
            },
            {
              "field": "storageKind",
              "title": "存储",
              "component": "vxe-select",
              "width": 112,
              "options": [
                { "label": "真实列", "value": "physical" },
                { "label": "虚拟列", "value": "virtual" }
              ]
            },
            {
              "field": "defaultValue",
              "title": "默认值",
              "component": "vxe-input",
              "minWidth": 120,
              "placeholder": "'draft' / 0 / now()"
            },
            {
              "field": "expression",
              "title": "表达式",
              "component": "vxe-input",
              "minWidth": 130,
              "placeholder": "quantity * unit_price"
            },
            { "field": "isRequired", "title": "必填", "component": "vxe-switch", "width": 72 },
            { "field": "isUnique", "title": "唯一", "component": "vxe-switch", "width": 72 }
          ]
        }
      }
    ],
    "actions": [
      { "code": "saveRows", "label": "保存字段集合", "type": "submit", "status": "primary" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-relation',
  '实体设计 - 关系',
  '实体外键关系编辑表单。',
  $schema$
  {
    "title": "外键关系",
    "columns": 2,
    "fields": [
      {
        "field": "sourceTableId",
        "label": "来源表",
        "component": "vxe-select",
        "optionsSourceKey": "tables",
        "props": { "filterable": true, "clearable": true },
        "rules": [{ "required": true, "message": "请选择来源表" }]
      },
      {
        "field": "sourceColumnName",
        "label": "来源列",
        "component": "vxe-select",
        "optionsSourceKey": "sourceColumns",
        "props": { "filterable": true, "clearable": true },
        "rules": [{ "required": true, "message": "请选择来源列" }]
      },
      {
        "field": "targetTableId",
        "label": "目标表",
        "component": "vxe-select",
        "optionsSourceKey": "tables",
        "props": { "filterable": true, "clearable": true },
        "rules": [{ "required": true, "message": "请选择目标表" }]
      },
      {
        "field": "targetColumnName",
        "label": "目标列",
        "component": "vxe-select",
        "optionsSourceKey": "targetColumns",
        "props": { "filterable": true, "clearable": true },
        "rules": [{ "required": true, "message": "请选择目标列" }]
      },
      {
        "field": "relationType",
        "label": "关系类型",
        "component": "vxe-select",
        "options": [
          { "label": "多对一", "value": "many_to_one" },
          { "label": "一对多", "value": "one_to_many" },
          { "label": "一对一", "value": "one_to_one" },
          { "label": "多对多", "value": "many_to_many" }
        ]
      },
      {
        "field": "isEnforced",
        "label": "创建真实 FK 约束",
        "component": "vxe-switch",
        "help": "开启后会尝试在数据库中创建外键约束。"
      }
    ],
    "layout": [
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "sourceTableId" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "sourceColumnName" }] }
        ]
      },
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "targetTableId" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "targetColumnName" }] }
        ]
      },
      {
        "kind": "row",
        "gutter": 10,
        "columns": [
          { "span": 12, "blocks": [{ "kind": "field", "field": "relationType" }] },
          { "span": 12, "blocks": [{ "kind": "field", "field": "isEnforced" }] }
        ]
      }
    ],
    "actions": [
      { "code": "save", "label": "保存关系", "type": "submit", "status": "primary" },
      { "code": "reset", "label": "新建关系", "type": "button" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-left-panel',
  '实体设计 - 左侧组合面板',
  '实体列表和实体信息组合表单，运行时注入嵌套表单及事件。',
  $schema$
  {
    "fields": [
      {
        "field": "table",
        "label": "表单",
        "component": "lc-sub-form",
        "showTitle": false,
        "props": { "vertical": true }
      },
      {
        "field": "tables",
        "label": "实体列表",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "showToolbar": false,
          "movable": false,
          "removable": false,
          "rowKey": "id",
          "height": "100%",
          "minHeight": 0,
          "maxHeight": "100%",
          "actionWidth": 76,
          "columns": [
            { "field": "title", "title": "表名称", "component": "lc-text", "minWidth": 150 },
            { "field": "fullName", "title": "真实表", "component": "lc-text", "minWidth": 150 },
            { "field": "columnCount", "title": "字段", "component": "lc-text", "width": 58 },
            { "field": "canvasStatus", "title": "画布", "component": "lc-text", "width": 70 }
          ]
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "fillRemaining": true,
        "defaultKey": "table-list",
        "tabs": [
          { "key": "table-list", "label": "实体列表", "blocks": [{ "kind": "field", "field": "tables" }] },
          { "key": "table-detail", "label": "新建实体", "blocks": [{ "kind": "field", "field": "table" }] }
        ]
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'entity-design-right-panel',
  '实体设计 - 右侧组合面板',
  '字段和关系组合表单，运行时注入嵌套表单、选项源及事件。',
  $schema$
  {
    "fields": [
      {
        "field": "columns",
        "label": "字段集合",
        "component": "lc-array-table",
        "showTitle": false,
        "help": "在表格中维护字段集合；点击画布字段或编辑表格行时，下方单列绑定会同步当前字段。",
        "props": { "height": "100%", "minHeight": 0, "maxHeight": "100%" }
      },
      {
        "field": "columnDetail",
        "label": "单列绑定",
        "component": "lc-sub-form",
        "showTitle": false,
        "help": "从字段集合或画布字段选择一列。",
        "props": { "vertical": true }
      },
      {
        "field": "relation",
        "label": "外键关系",
        "component": "lc-sub-form",
        "showTitle": false,
        "props": { "vertical": true }
      },
      {
        "field": "relations",
        "label": "关系列表",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "showToolbar": false,
          "movable": false,
          "removable": false,
          "rowKey": "id",
          "height": "100%",
          "minHeight": 0,
          "maxHeight": "100%",
          "actionWidth": 48,
          "columns": [
            { "field": "source", "title": "来源", "component": "lc-text", "minWidth": 150 },
            { "field": "target", "title": "目标", "component": "lc-text", "minWidth": 150 },
            { "field": "relationType", "title": "类型", "component": "lc-text", "width": 92 }
          ]
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "fillRemaining": true,
        "defaultKey": "column-list",
        "tabs": [
          { "key": "column-list", "label": "字段列表", "blocks": [{ "kind": "field", "field": "columns" }] },
          { "key": "column-detail", "label": "字段编辑", "blocks": [{ "kind": "field", "field": "columnDetail" }] },
          { "key": "relation-list", "label": "关系列表", "blocks": [{ "kind": "field", "field": "relations" }] },
          { "key": "relation-detail", "label": "关系编辑", "blocks": [{ "kind": "field", "field": "relation" }] }
        ]
      }
    ],
    "actions": [
      { "code": "saveRows", "label": "保存字段集合", "type": "button", "status": "primary" }
    ]
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

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
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

notify pgrst, 'reload schema';

comment on table public.lowcode_form_definitions is
  'Database-driven LowCodeForm schema definitions used by administrative editors.';
