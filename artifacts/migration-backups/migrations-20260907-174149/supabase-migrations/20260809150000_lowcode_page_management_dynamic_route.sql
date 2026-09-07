-- Keep low-code page management on the same database-driven runtime as other
-- dashboard menu pages. Existing database-edited schemas are never replaced.

with inserted_page as (
  insert into public.lowcode_pages (
    code,
    route,
    title,
    description,
    page_type,
    layout,
    status,
    keep_alive,
    schema,
    version,
    published_at
  ) values (
    'lowcode-pages',
    '/dashboard/low-code',
    '低代码页面管理',
    '低代码页面配置、发布状态与版本信息。',
    'list',
    'dashboard',
    'published',
    true,
    $schema$
    {
      "schemaVersion": 1,
      "code": "lowcode-pages",
      "route": "/dashboard/low-code",
      "title": "低代码页面管理",
      "description": "低代码页面配置、发布状态与版本信息。",
      "pageType": "list",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": true,
      "dataSources": {
        "pages": {
          "key": "pages",
          "label": "低代码页面",
          "serviceName": "lowcode",
          "serviceMethod": "listItems",
          "postData": {
            "resource": "lowcode_pages",
            "pageSize": 1000,
            "sorts": [
              { "field": "updated_at", "direction": "desc" }
            ]
          },
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "lowcode-page-actions",
          "kind": "buttonGroup",
          "align": "left",
          "gap": 8,
          "actions": [
            {
              "code": "show-all-pages",
              "label": "全部页面",
              "icon": "ri-list-check-2",
              "status": "primary",
              "directives": [
                {
                  "type": "setSearchFilters",
                  "sourceKey": "pages",
                  "mode": "replace",
                  "values": {}
                }
              ]
            },
            {
              "code": "show-published-pages",
              "label": "已发布",
              "icon": "ri-checkbox-circle-line",
              "directives": [
                {
                  "type": "setSearchFilters",
                  "sourceKey": "pages",
                  "mode": "replace",
                  "values": { "status": "published" }
                }
              ]
            },
            {
              "code": "show-draft-pages",
              "label": "草稿",
              "icon": "ri-draft-line",
              "directives": [
                {
                  "type": "setSearchFilters",
                  "sourceKey": "pages",
                  "mode": "replace",
                  "values": { "status": "draft" }
                }
              ]
            },
            {
              "code": "show-archived-pages",
              "label": "已归档",
              "icon": "ri-archive-line",
              "directives": [
                {
                  "type": "setSearchFilters",
                  "sourceKey": "pages",
                  "mode": "replace",
                  "values": { "status": "archived" }
                }
              ]
            },
            {
              "code": "reload-pages",
              "label": "刷新",
              "icon": "ri-refresh-line",
              "directives": [
                { "type": "refreshDataSource", "sourceKeys": ["pages"] }
              ]
            }
          ]
        },
        {
          "id": "lowcode-page-main-grid",
          "kind": "grid",
          "title": "低代码页面列表",
          "sourceKey": "pages",
          "layout": { "fillRemaining": true },
          "schema": {
            "grid": {
              "border": true,
              "stripe": true,
              "showOverflow": "tooltip",
              "height": "100%",
              "rowConfig": { "keyField": "id", "isCurrent": true },
              "columns": [
                { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                { "field": "code", "title": "页面编码", "minWidth": 190, "fixed": "left", "sortable": true },
                { "field": "title", "title": "页面名称", "minWidth": 180, "fixed": "left", "sortable": true },
                { "field": "route", "title": "路由", "minWidth": 260 },
                { "field": "page_type", "title": "页面类型", "width": 110, "align": "center" },
                { "field": "layout", "title": "布局", "width": 100, "align": "center" },
                {
                  "field": "status",
                  "title": "状态",
                  "width": 100,
                  "align": "center",
                  "formatter": {
                    "type": "enum",
                    "map": {
                      "draft": "草稿",
                      "published": "已发布",
                      "archived": "已归档"
                    },
                    "emptyText": "-"
                  }
                },
                { "field": "version", "title": "版本", "width": 90, "align": "right", "sortable": true },
                {
                  "field": "updated_at",
                  "title": "更新时间",
                  "width": 180,
                  "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" }
                }
              ]
            },
            "rowActions": { "edit": false, "delete": false }
          }
        }
      ]
    }
    $schema$::jsonb,
    1,
    timezone('utc'::text, now())
  )
  on conflict (code) do nothing
  returning id, version, schema, published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from inserted_page
on conflict (page_id, version) do nothing;

update public.admin_routes
set
  page_code = 'lowcode-pages',
  metadata = coalesce(metadata, '{}'::jsonb) - 'renderMode' - 'native',
  updated_at = timezone('utc'::text, now())
where code = 'lowcode-pages';

select pg_notify('pgrst', 'reload schema');
