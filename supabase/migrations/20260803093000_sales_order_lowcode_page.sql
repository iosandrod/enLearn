-- Register the sales order low-code page and sidebar menu entries.

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema,
  version,
  published_at
) values (
  'sales-orders',
  '/dashboard/sales/orders',
  '销售订单',
  '销售订单与销售订单明细列表。',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "sales-orders",
    "route": "/dashboard/sales/orders",
    "title": "销售订单",
    "description": "销售订单与销售订单明细列表。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "salesOrders": {
        "key": "salesOrders",
        "label": "销售订单",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "tableName": "sales_orders",
        "postData": {
          "tableName": "sales_orders",
          "sorts": [
            { "field": "doc_date", "direction": "desc" },
            { "field": "doc_no", "direction": "desc" }
          ],
          "limit": 1000
        },
        "autoLoad": true
      },
      "salesOrderLines": {
        "key": "salesOrderLines",
        "label": "销售订单明细",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "tableName": "sales_order_lines",
        "postData": {
          "tableName": "sales_order_lines",
          "filters": { "order_id": "__none__" },
          "sorts": [
            { "field": "line_no", "direction": "asc" },
            { "field": "created_at", "direction": "asc" }
          ],
          "limit": 1000
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "sales-order-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all",
            "label": "全部订单",
            "status": "primary",
            "icon": "ri-list-check-2",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "salesOrders",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-draft",
            "label": "草稿",
            "icon": "ri-draft-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "salesOrders",
                "mode": "replace",
                "values": { "status": "draft" }
              }
            ]
          },
          {
            "code": "show-open",
            "label": "未关闭",
            "icon": "ri-door-open-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "salesOrders",
                "mode": "replace",
                "values": { "close_status": "open" }
              }
            ]
          },
          {
            "code": "refresh",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["salesOrders"] }
            ]
          }
        ]
      },
      {
        "id": "sales-order-grid",
        "kind": "grid",
        "sourceKey": "salesOrders",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 360,
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columns": [
              { "type": "seq", "title": "序号", "width": 64, "align": "center" },
              { "field": "doc_no", "title": "订单号", "minWidth": 160, "fixed": "left", "sortable": true },
              { "field": "doc_date", "title": "单据日期", "width": 120, "sortable": true },
              { "field": "customer_code", "title": "客户编码", "minWidth": 140, "showOverflow": "tooltip" },
              { "field": "customer_name", "title": "客户名称", "minWidth": 200, "showOverflow": "tooltip" },
              { "field": "sales_org_name", "title": "销售组织", "minWidth": 160, "showOverflow": "tooltip" },
              { "field": "sales_department_name", "title": "销售部门", "minWidth": 160, "showOverflow": "tooltip" },
              { "field": "salesperson_name", "title": "业务员", "minWidth": 120, "showOverflow": "tooltip" },
              { "field": "currency_code", "title": "币种", "width": 88, "align": "center" },
              { "field": "total_qty", "title": "数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "tax_exclusive_amount", "title": "未税金额", "width": 130, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "tax_amount", "title": "税额", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "tax_inclusive_amount", "title": "价税合计", "width": 130, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "status", "title": "状态", "width": 96, "align": "center" },
              { "field": "approval_status", "title": "审批状态", "width": 110, "align": "center" },
              { "field": "close_status", "title": "关闭状态", "width": 110, "align": "center" },
              { "field": "external_doc_no", "title": "U9单号", "minWidth": 150, "showOverflow": "tooltip" },
              { "field": "remark", "title": "备注", "minWidth": 220, "showOverflow": "tooltip" }
            ]
          },
          "rowActions": { "edit": false, "delete": false },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedSalesOrderRows",
                "value": ["{{ event.row }}"]
              },
              {
                "type": "setSearchFilters",
                "sourceKey": "salesOrderLines",
                "mode": "replace",
                "values": { "order_id": "{{ event.row.id }}" }
              }
            ]
          }
        }
      },
      {
        "id": "sales-order-child-tabs",
        "kind": "tabs",
        "defaultKey": "lines",
        "tabs": [
          {
            "key": "lines",
            "label": "销售订单明细",
            "blocks": [
              {
                "id": "sales-order-lines-grid",
                "kind": "grid",
                "sourceKey": "salesOrderLines",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 240,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                      { "field": "line_no", "title": "行号", "width": 88, "align": "right", "sortable": true },
                      { "field": "item_code", "title": "物料编码", "minWidth": 150, "fixed": "left", "showOverflow": "tooltip" },
                      { "field": "item_name", "title": "物料名称", "minWidth": 200, "fixed": "left", "showOverflow": "tooltip" },
                      { "field": "item_spec", "title": "规格", "minWidth": 160, "showOverflow": "tooltip" },
                      { "field": "uom_name", "title": "单位", "width": 88, "align": "center" },
                      { "field": "ordered_qty", "title": "订购数量", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "delivered_qty", "title": "已交数量", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "open_qty", "title": "未交数量", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "unit_price", "title": "单价", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "tax_rate", "title": "税率", "width": 100, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "tax_exclusive_amount", "title": "未税金额", "width": 130, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "tax_amount", "title": "税额", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "tax_inclusive_amount", "title": "价税合计", "width": 130, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "need_date", "title": "需求日期", "width": 120 },
                      { "field": "promise_date", "title": "承诺日期", "width": 120 },
                      { "field": "delivery_date", "title": "交货日期", "width": 120 },
                      { "field": "warehouse_name", "title": "仓库", "minWidth": 140, "showOverflow": "tooltip" },
                      { "field": "source_doc_no", "title": "来源单号", "minWidth": 150, "showOverflow": "tooltip" },
                      { "field": "remark", "title": "备注", "minWidth": 220, "showOverflow": "tooltip" }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
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
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'sales-orders'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code,
  title,
  table_name,
  route_path,
  page_code,
  icon,
  description,
  primary_key,
  status,
  sort_order,
  schema
) values
  (
    'sales_orders',
    '销售订单',
    'public.sales_orders',
    '/dashboard/sales/orders',
    'sales-orders',
    'ri-file-list-3-line',
    'U9-style sales order header records.',
    'id',
    'active',
    210,
    '{}'::jsonb
  ),
  (
    'sales_order_lines',
    '销售订单明细',
    'public.sales_order_lines',
    '/dashboard/sales/order-lines',
    null,
    'ri-list-check-3',
    'U9-style sales order line records.',
    'id',
    'active',
    211,
    '{}'::jsonb
  )
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.admin_routes (
  code,
  title,
  path,
  route_type,
  icon,
  page_code,
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
) values (
  'sales-root',
  '销售管理',
  '/dashboard/sales/_group',
  'group',
  'ri-shopping-cart-2-line',
  null,
  'sales.orders.manage',
  true,
  true,
  'dashboard',
  'active',
  35,
  '{"group":"lowcode-app","category":"sales"}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.admin_routes (
  code,
  title,
  path,
  parent_id,
  route_type,
  icon,
  page_code,
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
)
select
  'sales-orders',
  '销售订单',
  '/dashboard/sales/orders',
  parent.id,
  'page',
  'ri-file-list-3-line',
  'sales-orders',
  'sales.orders.manage',
  true,
  true,
  'dashboard',
  'active',
  10,
  '{"group":"lowcode-app","category":"sales"}'::jsonb
from public.admin_routes parent
where parent.code = 'sales-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code = 'sales.orders.manage'
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

select pg_notify('pgrst', 'reload schema');
