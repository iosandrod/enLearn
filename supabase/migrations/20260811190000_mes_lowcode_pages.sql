-- MES read models and low-code production-management pages.

begin;

create or replace view public.mes_work_order_runtime_view
with (security_invoker = true)
as
select
  work_order.*,
  item.name as item_name,
  location.name as location_name,
  plan_version.code as plan_version_code,
  plan_version.name as plan_version_name,
  work_order.planned_quantity - work_order.good_quantity - work_order.scrap_quantity
    as remaining_quantity
from public.mes_work_order work_order
left join public.planning_item item
  on item.account_id = work_order.account_id and item.id = work_order.item_id
left join public.planning_location location
  on location.account_id = work_order.account_id and location.id = work_order.location_id
left join public.planning_plan_version plan_version
  on plan_version.account_id = work_order.account_id
 and plan_version.id = work_order.source_plan_version_id;

create or replace view public.mes_work_order_operation_runtime_view
with (security_invoker = true)
as
select
  operation.*,
  work_order.work_order_no,
  work_order.status as work_order_status,
  work_order.item_id,
  item.name as item_name,
  operation.planned_quantity - operation.good_quantity - operation.scrap_quantity
    as remaining_quantity
from public.mes_work_order_operation operation
join public.mes_work_order work_order
  on work_order.account_id = operation.account_id
 and work_order.id = operation.work_order_id
left join public.planning_item item
  on item.account_id = work_order.account_id and item.id = work_order.item_id;

create or replace view public.mes_work_order_component_runtime_view
with (security_invoker = true)
as
select
  component.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  item.name as item_name,
  item.uom,
  component.issued_quantity - component.returned_quantity as net_issued_quantity,
  greatest(component.issued_quantity - component.returned_quantity, 0)
    as available_to_return
from public.mes_work_order_component component
join public.mes_work_order work_order
  on work_order.account_id = component.account_id
 and work_order.id = component.work_order_id
left join public.mes_work_order_operation operation
  on operation.account_id = component.account_id
 and operation.id = component.operation_id
left join public.planning_item item
  on item.account_id = component.account_id and item.id = component.item_id;

create or replace view public.mes_production_transaction_runtime_view
with (security_invoker = true)
as
select
  transaction.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  original.transaction_type as original_transaction_type,
  reversal.id as reversal_transaction_id,
  (reversal.id is not null) as is_reversed,
  (transaction.transaction_type = 'report'
    and transaction.original_transaction_id is null
    and reversal.id is null) as reversible
from public.mes_production_transaction transaction
join public.mes_work_order work_order
  on work_order.account_id = transaction.account_id
 and work_order.id = transaction.work_order_id
join public.mes_work_order_operation operation
  on operation.account_id = transaction.account_id
 and operation.id = transaction.operation_id
left join public.mes_production_transaction original
  on original.account_id = transaction.account_id
 and original.id = transaction.original_transaction_id
left join public.mes_production_transaction reversal
  on reversal.account_id = transaction.account_id
 and reversal.original_transaction_id = transaction.id;

create or replace view public.mes_material_transaction_runtime_view
with (security_invoker = true)
as
select
  transaction.*,
  work_order.work_order_no,
  operation.operation_code,
  operation.operation_name,
  operation.status as operation_status,
  operation.row_version as operation_row_version,
  item.name as item_name,
  item.uom,
  original.transaction_type as original_transaction_type,
  reversal.id as reversal_transaction_id,
  (reversal.id is not null) as is_reversed,
  (transaction.transaction_type in ('issue', 'return', 'consume')
    and transaction.original_transaction_id is null
    and reversal.id is null) as reversible
from public.mes_material_transaction transaction
join public.mes_work_order work_order
  on work_order.account_id = transaction.account_id
 and work_order.id = transaction.work_order_id
left join public.mes_work_order_operation operation
  on operation.account_id = transaction.account_id
 and operation.id = transaction.operation_id
join public.planning_item item
  on item.account_id = transaction.account_id and item.id = transaction.item_id
left join public.mes_material_transaction original
  on original.account_id = transaction.account_id
 and original.id = transaction.original_transaction_id
left join public.mes_material_transaction reversal
  on reversal.account_id = transaction.account_id
 and reversal.original_transaction_id = transaction.id;

grant select on public.mes_work_order_runtime_view to authenticated, service_role;
grant select on public.mes_work_order_operation_runtime_view to authenticated, service_role;
grant select on public.mes_work_order_component_runtime_view to authenticated, service_role;
grant select on public.mes_production_transaction_runtime_view to authenticated, service_role;
grant select on public.mes_material_transaction_runtime_view to authenticated, service_role;

with page_seed(code, route, title, description, schema) as (
  values
  (
    'mes_release_console',
    '/dashboard/production/release',
    '计划释放',
    '将已发布排产版本中的制造计划释放为 MES 生产工单。',
    $json$
    {
      "schemaVersion": 1,
      "code": "mes_release_console",
      "route": "/dashboard/production/release",
      "title": "计划释放",
      "pageType": "custom",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": true,
      "dataSources": {
        "releaseCandidates": {
          "key": "releaseCandidates",
          "label": "可释放计划",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listReleaseCandidates",
          "postData": {},
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "mes-release-actions",
          "kind": "buttonGroup",
          "materialVersion": "1.0.0",
          "align": "left",
          "gap": 8,
          "actions": [
            {
              "code": "refresh",
              "label": "刷新",
              "icon": "ri-refresh-line",
              "directives": [
                { "type": "refreshDataSource", "sourceKeys": ["releaseCandidates"] }
              ]
            }
          ]
        },
        {
          "id": "mes-release-filter",
          "kind": "searchForm",
          "materialVersion": "1.0.0",
          "targetSourceKey": "releaseCandidates",
          "initialValues": { "reference": "", "item_name": "", "plan_version_code": "" },
          "schema": {
            "columns": 4,
            "fields": [
              { "field": "reference", "label": "计划单号", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "item_name", "label": "物料", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "plan_version_code", "label": "计划版本", "component": "vxe-input", "props": { "clearable": true } }
            ],
            "actions": [
              { "code": "submit", "label": "筛选", "type": "submit", "status": "primary", "icon": "ri-search-line" },
              { "code": "reset", "label": "重置", "type": "reset", "icon": "ri-refresh-line" }
            ]
          }
        },
        {
          "id": "mes-release-grid",
          "kind": "grid",
          "materialVersion": "1.0.0",
          "sourceKey": "releaseCandidates",
          "sourceType": "custom",
          "clientFilter": true,
          "tableType": "main",
          "schema": {
            "grid": {
              "border": true,
              "stripe": true,
              "showOverflow": "tooltip",
              "height": 560,
              "rowConfig": { "keyField": "id", "isCurrent": true },
              "columnConfig": { "resizable": true },
              "columns": [
                { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                { "field": "reference", "title": "计划单号", "minWidth": 170, "fixed": "left", "sortable": true },
                { "field": "item_name", "title": "物料", "minWidth": 180, "showOverflow": "tooltip" },
                { "field": "location_name", "title": "地点", "minWidth": 150 },
                { "field": "plan_version_code", "title": "计划版本", "minWidth": 150 },
                { "field": "quantity", "title": "计划数量", "width": 120, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "released_quantity", "title": "已释放", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "remaining_quantity", "title": "可释放", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "uom", "title": "单位", "width": 90 },
                { "field": "startdate", "title": "计划开始", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "field": "enddate", "title": "计划结束", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "title": "操作", "width": 112, "fixed": "right", "slots": { "default": "actions" } }
              ]
            },
            "rowActions": {
              "edit": false,
              "delete": false,
              "actions": [
                {
                  "code": "release",
                  "label": "释放",
                  "icon": "ri-send-plane-line",
                  "status": "primary",
                  "permissionCode": "mes.execution.manage",
                  "directives": [
                    {
                      "type": "openGlobalDialog",
                      "model": {
                        "operationPlanId": "{{ row.id }}",
                        "workOrderNo": "",
                        "quantity": "{{ row.remaining_quantity }}"
                      },
                      "config": {
                        "title": "释放生产工单",
                        "width": 620,
                        "showFooter": true,
                        "form": {
                          "schema": {
                            "columns": 2,
                            "fields": [
                              { "field": "workOrderNo", "label": "工单号", "component": "vxe-input", "span": 2, "props": { "clearable": true, "placeholder": "留空自动生成" } },
                              { "field": "quantity", "label": "释放数量", "component": "vxe-input", "span": 2, "props": { "type": "number", "clearable": true }, "rules": [{ "required": true, "message": "请输入释放数量" }] }
                            ],
                            "actions": []
                          }
                        },
                        "actions": [
                          { "code": "cancel", "label": "取消", "role": "cancel" },
                          { "code": "confirm", "label": "确认释放", "role": "confirm", "status": "primary" }
                        ]
                      },
                      "confirmDirectives": [
                        {
                          "type": "invokeService",
                          "serviceName": "mes",
                          "serviceMethod": "releaseWorkOrder",
                          "postData": {
                            "operationPlanId": "{{ event.values.operationPlanId }}",
                            "workOrderNo": "{{ event.values.workOrderNo }}",
                            "quantity": "{{ event.values.quantity }}"
                          }
                        },
                        { "type": "refreshDataSource", "sourceKeys": ["releaseCandidates"] },
                        { "type": "showMessage", "status": "success", "message": "生产工单已释放。" }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
    $json$::jsonb
  ),
  (
    'mes_execution_console',
    '/dashboard/production/execution',
    '生产执行工作台',
    '按工单执行工序、报工、投退料与补偿事务。',
    $json$
    {
      "schemaVersion": 1,
      "code": "mes_execution_console",
      "route": "/dashboard/production/execution",
      "title": "生产执行工作台",
      "pageType": "custom",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": true,
      "dataSources": {
        "workOrders": {
          "key": "workOrders",
          "label": "生产工单",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_work_order_runtime_view", "limit": 500 },
          "autoLoad": true
        },
        "operations": {
          "key": "operations",
          "label": "工序",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_work_order_operation_runtime_view", "filters": { "work_order_id": "__none__" }, "requiredFilters": ["work_order_id"], "limit": 500 },
          "autoLoad": false
        },
        "components": {
          "key": "components",
          "label": "工单组件",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_work_order_component_runtime_view", "filters": { "work_order_id": "__none__" }, "requiredFilters": ["work_order_id"], "limit": 500 },
          "autoLoad": false
        },
        "productionTransactions": {
          "key": "productionTransactions",
          "label": "生产事务",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_production_transaction_runtime_view", "filters": { "work_order_id": "__none__" }, "requiredFilters": ["work_order_id"], "limit": 500 },
          "autoLoad": false
        },
        "materialTransactions": {
          "key": "materialTransactions",
          "label": "物料事务",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_material_transaction_runtime_view", "filters": { "work_order_id": "__none__" }, "requiredFilters": ["work_order_id"], "limit": 500 },
          "autoLoad": false
        }
      },
      "blocks": [
        {
          "id": "mes-execution-actions",
          "kind": "buttonGroup",
          "materialVersion": "1.0.0",
          "align": "left",
          "gap": 8,
          "actions": [
            {
              "code": "refresh",
              "label": "刷新",
              "icon": "ri-refresh-line",
              "directives": [
                { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations", "components", "productionTransactions", "materialTransactions"] }
              ]
            },
            {
              "code": "release",
              "label": "计划释放",
              "icon": "ri-send-plane-line",
              "route": "/dashboard/production/release"
            }
          ]
        },
        {
          "id": "mes-work-order-filter",
          "kind": "searchForm",
          "materialVersion": "1.0.0",
          "targetSourceKey": "workOrders",
          "initialValues": { "status": "", "work_order_no": "" },
          "schema": {
            "columns": 4,
            "fields": [
              {
                "field": "status",
                "label": "工单状态",
                "component": "vxe-select",
                "props": { "clearable": true },
                "options": [
                  { "label": "已释放", "value": "released" },
                  { "label": "执行中", "value": "in_progress" },
                  { "label": "已暂停", "value": "paused" },
                  { "label": "已完工", "value": "completed" },
                  { "label": "已关闭", "value": "closed" },
                  { "label": "已取消", "value": "canceled" }
                ]
              },
              { "field": "work_order_no", "label": "工单号", "component": "vxe-input", "props": { "clearable": true } }
            ],
            "actions": [
              { "code": "submit", "label": "筛选", "type": "submit", "status": "primary", "icon": "ri-search-line" },
              { "code": "reset", "label": "重置", "type": "reset", "icon": "ri-refresh-line" }
            ]
          }
        },
        {
          "id": "mes-work-order-grid",
          "kind": "grid",
          "materialVersion": "1.0.0",
          "sourceKey": "workOrders",
          "sourceType": "custom",
          "tableType": "main",
          "schema": {
            "grid": {
              "border": true,
              "stripe": true,
              "showOverflow": "tooltip",
              "height": 300,
              "rowConfig": { "keyField": "id", "isCurrent": true },
              "columnConfig": { "resizable": true },
              "columns": [
                { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                { "field": "work_order_no", "title": "工单号", "minWidth": 170, "fixed": "left", "sortable": true },
                { "field": "item_name", "title": "物料", "minWidth": 180, "showOverflow": "tooltip" },
                { "field": "status", "title": "状态", "width": 106, "align": "center", "formatter": { "type": "enum", "map": { "released": "已释放", "in_progress": "执行中", "paused": "已暂停", "completed": "已完工", "closed": "已关闭", "canceled": "已取消" }, "emptyText": "-" } },
                { "field": "planned_quantity", "title": "计划数量", "width": 116, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "good_quantity", "title": "良品", "width": 100, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "scrap_quantity", "title": "报废", "width": 100, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "remaining_quantity", "title": "未报工", "width": 106, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "uom", "title": "单位", "width": 86 },
                { "field": "batch", "title": "批次", "minWidth": 130 },
                { "field": "planned_start", "title": "计划开始", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "field": "planned_end", "title": "计划结束", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "field": "row_version", "title": "版本", "width": 82, "align": "right" }
              ]
            },
            "rowActions": { "edit": false, "delete": false },
            "events": {
              "rowCurrentChange": [
                { "type": "setSearchFilters", "sourceKey": "operations", "mode": "replace", "values": { "work_order_id": "{{ event.row.id }}" } },
                { "type": "setSearchFilters", "sourceKey": "components", "mode": "replace", "values": { "work_order_id": "{{ event.row.id }}" } },
                { "type": "setSearchFilters", "sourceKey": "productionTransactions", "mode": "replace", "values": { "work_order_id": "{{ event.row.id }}" } },
                { "type": "setSearchFilters", "sourceKey": "materialTransactions", "mode": "replace", "values": { "work_order_id": "{{ event.row.id }}" } }
              ]
            }
          }
        },
        {
          "id": "mes-execution-tabs",
          "kind": "tabs",
          "materialVersion": "1.0.0",
          "defaultKey": "operations",
          "tabs": [
            {
              "key": "operations",
              "label": "工序执行",
              "blocks": [
                {
                  "id": "mes-operation-grid",
                  "kind": "grid",
                  "materialVersion": "1.0.0",
                  "sourceKey": "operations",
                  "sourceType": "custom",
                  "tableType": "detail",
                  "schema": {
                    "grid": {
                      "border": true,
                      "stripe": true,
                      "showOverflow": "tooltip",
                      "height": 330,
                      "rowConfig": { "keyField": "id", "isCurrent": true },
                      "columns": [
                        { "field": "sequence_no", "title": "顺序", "width": 72, "align": "right", "fixed": "left" },
                        { "field": "operation_code", "title": "工序编码", "minWidth": 140, "fixed": "left" },
                        { "field": "operation_name", "title": "工序名称", "minWidth": 170, "fixed": "left" },
                        { "field": "status", "title": "状态", "width": 104, "align": "center", "formatter": { "type": "enum", "map": { "pending": "待前序", "ready": "就绪", "in_progress": "执行中", "paused": "已暂停", "completed": "已完工", "skipped": "已跳过", "canceled": "已取消" }, "emptyText": "-" } },
                        { "field": "planned_quantity", "title": "计划数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "good_quantity", "title": "良品", "width": 92, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "scrap_quantity", "title": "报废", "width": 92, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "remaining_quantity", "title": "未报工", "width": 100, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "actual_start", "title": "实际开始", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                        { "field": "actual_end", "title": "实际结束", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                        { "field": "row_version", "title": "版本", "width": 78, "align": "right" },
                        { "title": "操作", "width": 440, "fixed": "right", "slots": { "default": "actions" } }
                      ]
                    },
                    "rowActions": {
                      "edit": false,
                      "delete": false,
                      "actions": [
                        {
                          "code": "start",
                          "label": "开工",
                          "icon": "ri-play-line",
                          "status": "success",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            { "type": "invokeService", "serviceName": "mes", "serviceMethod": "startOperation", "postData": { "operationId": "{{ row.id }}", "expectedVersion": "{{ row.row_version }}" } },
                            { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations"] },
                            { "type": "showMessage", "status": "success", "message": "工序已开工。" }
                          ]
                        },
                        {
                          "code": "pause",
                          "label": "暂停",
                          "icon": "ri-pause-line",
                          "status": "warning",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "operationId": "{{ row.id }}", "expectedVersion": "{{ row.row_version }}", "reasonCode": "" },
                              "config": {
                                "title": "暂停工序",
                                "width": 560,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 1,
                                    "fields": [
                                      { "field": "reasonCode", "label": "暂停原因", "component": "vxe-input", "span": 1, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入暂停原因" }] }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认暂停", "role": "confirm", "status": "warning" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "pauseOperation", "postData": { "operationId": "{{ event.values.operationId }}", "expectedVersion": "{{ event.values.expectedVersion }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations"] },
                                { "type": "showMessage", "status": "success", "message": "工序已暂停。" }
                              ]
                            }
                          ]
                        },
                        {
                          "code": "resume",
                          "label": "恢复",
                          "icon": "ri-restart-line",
                          "status": "success",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            { "type": "invokeService", "serviceName": "mes", "serviceMethod": "resumeOperation", "postData": { "operationId": "{{ row.id }}", "expectedVersion": "{{ row.row_version }}" } },
                            { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations"] },
                            { "type": "showMessage", "status": "success", "message": "工序已恢复。" }
                          ]
                        },
                        {
                          "code": "report",
                          "label": "报工",
                          "icon": "ri-file-check-line",
                          "status": "primary",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "operationId": "{{ row.id }}", "expectedVersion": "{{ row.row_version }}", "goodQuantity": "{{ row.remaining_quantity }}", "scrapQuantity": 0 },
                              "config": {
                                "title": "生产报工",
                                "width": 620,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 2,
                                    "fields": [
                                      { "field": "goodQuantity", "label": "良品数量", "component": "vxe-input", "span": 1, "props": { "type": "number", "clearable": true } },
                                      { "field": "scrapQuantity", "label": "报废数量", "component": "vxe-input", "span": 1, "props": { "type": "number", "clearable": true } }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认报工", "role": "confirm", "status": "primary" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "reportProduction", "postData": { "operationId": "{{ event.values.operationId }}", "expectedVersion": "{{ event.values.expectedVersion }}", "goodQuantity": "{{ event.values.goodQuantity }}", "scrapQuantity": "{{ event.values.scrapQuantity }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations", "productionTransactions"] },
                                { "type": "showMessage", "status": "success", "message": "生产报工已记录。" }
                              ]
                            }
                          ]
                        },
                        {
                          "code": "complete",
                          "label": "完工",
                          "icon": "ri-checkbox-circle-line",
                          "status": "primary",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            { "type": "invokeService", "serviceName": "mes", "serviceMethod": "completeOperation", "postData": { "operationId": "{{ row.id }}", "expectedVersion": "{{ row.row_version }}" } },
                            { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations"] },
                            { "type": "showMessage", "status": "success", "message": "工序已完工。" }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            },
            {
              "key": "components",
              "label": "投退料",
              "blocks": [
                {
                  "id": "mes-component-grid",
                  "kind": "grid",
                  "materialVersion": "1.0.0",
                  "sourceKey": "components",
                  "sourceType": "custom",
                  "tableType": "detail",
                  "schema": {
                    "grid": {
                      "border": true,
                      "stripe": true,
                      "showOverflow": "tooltip",
                      "height": 330,
                      "rowConfig": { "keyField": "id", "isCurrent": true },
                      "columns": [
                        { "field": "operation_name", "title": "工序", "minWidth": 160, "fixed": "left" },
                        { "field": "item_name", "title": "物料", "minWidth": 190, "fixed": "left" },
                        { "field": "requirement_type", "title": "类型", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "consume": "消耗", "produce": "产出" }, "emptyText": "-" } },
                        { "field": "required_quantity", "title": "需求数量", "width": 112, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "issued_quantity", "title": "累计投料", "width": 112, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "returned_quantity", "title": "累计退料", "width": 112, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "net_issued_quantity", "title": "净投料", "width": 104, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "uom", "title": "单位", "width": 86 },
                        { "field": "operation_status", "title": "工序状态", "width": 106 },
                        { "title": "操作", "width": 190, "fixed": "right", "slots": { "default": "actions" } }
                      ]
                    },
                    "rowActions": {
                      "edit": false,
                      "delete": false,
                      "actions": [
                        {
                          "code": "issue",
                          "label": "投料",
                          "icon": "ri-inbox-archive-line",
                          "status": "primary",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "componentId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "quantity": "", "lotNo": "", "serialNo": "" },
                              "config": {
                                "title": "物料投料",
                                "width": 680,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 2,
                                    "fields": [
                                      { "field": "quantity", "label": "投料数量", "component": "vxe-input", "span": 2, "props": { "type": "number", "clearable": true }, "rules": [{ "required": true, "message": "请输入投料数量" }] },
                                      { "field": "lotNo", "label": "批次号", "component": "vxe-input", "span": 1, "props": { "clearable": true } },
                                      { "field": "serialNo", "label": "序列号", "component": "vxe-input", "span": 1, "props": { "clearable": true } }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认投料", "role": "confirm", "status": "primary" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "issueMaterial", "postData": { "componentId": "{{ event.values.componentId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "quantity": "{{ event.values.quantity }}", "lotNo": "{{ event.values.lotNo }}", "serialNo": "{{ event.values.serialNo }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["operations", "components", "materialTransactions"] },
                                { "type": "showMessage", "status": "success", "message": "投料事务已记录。" }
                              ]
                            }
                          ]
                        },
                        {
                          "code": "return",
                          "label": "退料",
                          "icon": "ri-arrow-go-back-line",
                          "status": "warning",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "componentId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "quantity": "{{ row.available_to_return }}", "lotNo": "", "serialNo": "", "reasonCode": "" },
                              "config": {
                                "title": "物料退料",
                                "width": 680,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 2,
                                    "fields": [
                                      { "field": "quantity", "label": "退料数量", "component": "vxe-input", "span": 2, "props": { "type": "number", "clearable": true }, "rules": [{ "required": true, "message": "请输入退料数量" }] },
                                      { "field": "lotNo", "label": "批次号", "component": "vxe-input", "span": 1, "props": { "clearable": true } },
                                      { "field": "serialNo", "label": "序列号", "component": "vxe-input", "span": 1, "props": { "clearable": true } },
                                      { "field": "reasonCode", "label": "退料原因", "component": "vxe-input", "span": 2, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入退料原因" }] }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认退料", "role": "confirm", "status": "warning" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "returnMaterial", "postData": { "componentId": "{{ event.values.componentId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "quantity": "{{ event.values.quantity }}", "lotNo": "{{ event.values.lotNo }}", "serialNo": "{{ event.values.serialNo }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["operations", "components", "materialTransactions"] },
                                { "type": "showMessage", "status": "success", "message": "退料事务已记录。" }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            },
            {
              "key": "production-transactions",
              "label": "生产事务",
              "blocks": [
                {
                  "id": "mes-production-transaction-grid",
                  "kind": "grid",
                  "materialVersion": "1.0.0",
                  "sourceKey": "productionTransactions",
                  "sourceType": "custom",
                  "tableType": "detail",
                  "schema": {
                    "grid": {
                      "border": true,
                      "stripe": true,
                      "showOverflow": "tooltip",
                      "height": 330,
                      "rowConfig": { "keyField": "id", "isCurrent": true },
                      "columns": [
                        { "field": "operation_name", "title": "工序", "minWidth": 170, "fixed": "left" },
                        { "field": "transaction_type", "title": "事务类型", "width": 104, "align": "center", "formatter": { "type": "enum", "map": { "report": "报工", "reverse": "冲销" }, "emptyText": "-" } },
                        { "field": "good_quantity", "title": "良品数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "scrap_quantity", "title": "报废数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "reason_code", "title": "原因", "minWidth": 160 },
                        { "field": "original_transaction_id", "title": "原事务", "minWidth": 230 },
                        { "field": "reversal_transaction_id", "title": "冲销事务", "minWidth": 230 },
                        { "field": "occurred_at", "title": "发生时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                        { "field": "device_id", "title": "设备", "minWidth": 130 },
                        { "title": "操作", "width": 116, "fixed": "right", "slots": { "default": "actions" } }
                      ]
                    },
                    "rowActions": {
                      "edit": false,
                      "delete": false,
                      "actions": [
                        {
                          "code": "reverse-production",
                          "label": "撤销报工",
                          "icon": "ri-arrow-go-back-line",
                          "status": "danger",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "transactionId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "reasonCode": "" },
                              "config": {
                                "title": "撤销生产报工",
                                "width": 560,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 1,
                                    "fields": [
                                      { "field": "reasonCode", "label": "撤销原因", "component": "vxe-input", "span": 1, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入撤销原因" }] }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认撤销", "role": "confirm", "status": "danger" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "reverseProduction", "postData": { "transactionId": "{{ event.values.transactionId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["workOrders", "operations", "productionTransactions"] },
                                { "type": "showMessage", "status": "success", "message": "生产报工已冲销。" }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            },
            {
              "key": "material-transactions",
              "label": "物料事务",
              "blocks": [
                {
                  "id": "mes-material-transaction-grid",
                  "kind": "grid",
                  "materialVersion": "1.0.0",
                  "sourceKey": "materialTransactions",
                  "sourceType": "custom",
                  "tableType": "detail",
                  "schema": {
                    "grid": {
                      "border": true,
                      "stripe": true,
                      "showOverflow": "tooltip",
                      "height": 330,
                      "rowConfig": { "keyField": "id", "isCurrent": true },
                      "columns": [
                        { "field": "operation_name", "title": "工序", "minWidth": 150, "fixed": "left" },
                        { "field": "item_name", "title": "物料", "minWidth": 180, "fixed": "left" },
                        { "field": "transaction_type", "title": "事务类型", "width": 104, "align": "center", "formatter": { "type": "enum", "map": { "issue": "投料", "return": "退料", "consume": "消耗", "reverse": "冲销" }, "emptyText": "-" } },
                        { "field": "quantity", "title": "数量", "width": 108, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                        { "field": "lot_no", "title": "批次号", "minWidth": 140 },
                        { "field": "serial_no", "title": "序列号", "minWidth": 150 },
                        { "field": "reason_code", "title": "原因", "minWidth": 150 },
                        { "field": "original_transaction_id", "title": "原事务", "minWidth": 230 },
                        { "field": "occurred_at", "title": "发生时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                        { "title": "操作", "width": 116, "fixed": "right", "slots": { "default": "actions" } }
                      ]
                    },
                    "rowActions": {
                      "edit": false,
                      "delete": false,
                      "actions": [
                        {
                          "code": "reverse-material",
                          "label": "反向事务",
                          "icon": "ri-arrow-go-back-line",
                          "status": "danger",
                          "permissionCode": "mes.execution.manage",
                          "directives": [
                            {
                              "type": "openGlobalDialog",
                              "model": { "transactionId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "reasonCode": "" },
                              "config": {
                                "title": "物料反向事务",
                                "width": 560,
                                "showFooter": true,
                                "form": {
                                  "schema": {
                                    "columns": 1,
                                    "fields": [
                                      { "field": "reasonCode", "label": "反向原因", "component": "vxe-input", "span": 1, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入反向原因" }] }
                                    ],
                                    "actions": []
                                  }
                                },
                                "actions": [
                                  { "code": "cancel", "label": "取消", "role": "cancel" },
                                  { "code": "confirm", "label": "确认反向", "role": "confirm", "status": "danger" }
                                ]
                              },
                              "confirmDirectives": [
                                { "type": "invokeService", "serviceName": "mes", "serviceMethod": "reverseMaterial", "postData": { "transactionId": "{{ event.values.transactionId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                                { "type": "refreshDataSource", "sourceKeys": ["operations", "components", "materialTransactions"] },
                                { "type": "showMessage", "status": "success", "message": "物料事务已反向。" }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }
    $json$::jsonb
  ),
  (
    'mes_production_ledger',
    '/dashboard/production/production-ledger',
    '生产事务',
    '查询生产报工与冲销事务。',
    $json$
    {
      "schemaVersion": 1,
      "code": "mes_production_ledger",
      "route": "/dashboard/production/production-ledger",
      "title": "生产事务",
      "pageType": "list",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": true,
      "dataSources": {
        "productionLedger": {
          "key": "productionLedger",
          "label": "生产事务",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_production_transaction_runtime_view", "limit": 1000 },
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "mes-production-ledger-actions",
          "kind": "buttonGroup",
          "materialVersion": "1.0.0",
          "align": "left",
          "gap": 8,
          "actions": [
            { "code": "refresh", "label": "刷新", "icon": "ri-refresh-line", "directives": [{ "type": "refreshDataSource", "sourceKeys": ["productionLedger"] }] }
          ]
        },
        {
          "id": "mes-production-ledger-filter",
          "kind": "searchForm",
          "materialVersion": "1.0.0",
          "targetSourceKey": "productionLedger",
          "initialValues": { "work_order_no": "", "transaction_type": "", "operation_name": "" },
          "schema": {
            "columns": 4,
            "fields": [
              { "field": "work_order_no", "label": "工单号", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "operation_name", "label": "工序", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "transaction_type", "label": "事务类型", "component": "vxe-select", "props": { "clearable": true }, "options": [{ "label": "报工", "value": "report" }, { "label": "冲销", "value": "reverse" }] }
            ],
            "actions": [
              { "code": "submit", "label": "筛选", "type": "submit", "status": "primary", "icon": "ri-search-line" },
              { "code": "reset", "label": "重置", "type": "reset", "icon": "ri-refresh-line" }
            ]
          }
        },
        {
          "id": "mes-production-ledger-grid",
          "kind": "grid",
          "materialVersion": "1.0.0",
          "sourceKey": "productionLedger",
          "sourceType": "custom",
          "tableType": "main",
          "schema": {
            "grid": {
              "border": true,
              "stripe": true,
              "showOverflow": "tooltip",
              "height": 550,
              "rowConfig": { "keyField": "id", "isCurrent": true },
              "columns": [
                { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                { "field": "work_order_no", "title": "工单号", "minWidth": 170, "fixed": "left" },
                { "field": "operation_name", "title": "工序", "minWidth": 170, "fixed": "left" },
                { "field": "transaction_type", "title": "事务类型", "width": 104, "align": "center", "formatter": { "type": "enum", "map": { "report": "报工", "reverse": "冲销" }, "emptyText": "-" } },
                { "field": "good_quantity", "title": "良品数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "scrap_quantity", "title": "报废数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "reason_code", "title": "原因", "minWidth": 170 },
                { "field": "original_transaction_id", "title": "原事务", "minWidth": 230 },
                { "field": "reversal_transaction_id", "title": "冲销事务", "minWidth": 230 },
                { "field": "operator_id", "title": "操作人", "minWidth": 230 },
                { "field": "device_id", "title": "设备", "minWidth": 130 },
                { "field": "occurred_at", "title": "发生时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "field": "recorded_at", "title": "记录时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "title": "操作", "width": 116, "fixed": "right", "slots": { "default": "actions" } }
              ]
            },
            "rowActions": {
              "edit": false,
              "delete": false,
              "actions": [
                {
                  "code": "reverse-production",
                  "label": "撤销报工",
                  "icon": "ri-arrow-go-back-line",
                  "status": "danger",
                  "permissionCode": "mes.execution.manage",
                  "directives": [
                    {
                      "type": "openGlobalDialog",
                      "model": { "transactionId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "reasonCode": "" },
                      "config": {
                        "title": "撤销生产报工",
                        "width": 560,
                        "showFooter": true,
                        "form": { "schema": { "columns": 1, "fields": [{ "field": "reasonCode", "label": "撤销原因", "component": "vxe-input", "span": 1, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入撤销原因" }] }], "actions": [] } },
                        "actions": [{ "code": "cancel", "label": "取消", "role": "cancel" }, { "code": "confirm", "label": "确认撤销", "role": "confirm", "status": "danger" }]
                      },
                      "confirmDirectives": [
                        { "type": "invokeService", "serviceName": "mes", "serviceMethod": "reverseProduction", "postData": { "transactionId": "{{ event.values.transactionId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                        { "type": "refreshDataSource", "sourceKeys": ["productionLedger"] },
                        { "type": "showMessage", "status": "success", "message": "生产报工已冲销。" }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
    $json$::jsonb
  ),
  (
    'mes_material_ledger',
    '/dashboard/production/material-ledger',
    '物料追溯',
    '按工单、物料、批次和序列号查询物料事务。',
    $json$
    {
      "schemaVersion": 1,
      "code": "mes_material_ledger",
      "route": "/dashboard/production/material-ledger",
      "title": "物料追溯",
      "pageType": "list",
      "layout": "dashboard",
      "status": "published",
      "keepAlive": true,
      "dataSources": {
        "materialLedger": {
          "key": "materialLedger",
          "label": "物料事务",
          "sourceType": "custom",
          "serviceName": "mes",
          "serviceMethod": "listItems",
          "postData": { "resource": "mes_material_transaction_runtime_view", "limit": 1000 },
          "autoLoad": true
        }
      },
      "blocks": [
        {
          "id": "mes-material-ledger-actions",
          "kind": "buttonGroup",
          "materialVersion": "1.0.0",
          "align": "left",
          "gap": 8,
          "actions": [
            { "code": "refresh", "label": "刷新", "icon": "ri-refresh-line", "directives": [{ "type": "refreshDataSource", "sourceKeys": ["materialLedger"] }] }
          ]
        },
        {
          "id": "mes-material-ledger-filter",
          "kind": "searchForm",
          "materialVersion": "1.0.0",
          "targetSourceKey": "materialLedger",
          "initialValues": { "work_order_no": "", "item_name": "", "lot_no": "", "serial_no": "", "transaction_type": "" },
          "schema": {
            "columns": 5,
            "fields": [
              { "field": "work_order_no", "label": "工单号", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "item_name", "label": "物料", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "lot_no", "label": "批次号", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "serial_no", "label": "序列号", "component": "vxe-input", "props": { "clearable": true } },
              { "field": "transaction_type", "label": "事务类型", "component": "vxe-select", "props": { "clearable": true }, "options": [{ "label": "投料", "value": "issue" }, { "label": "退料", "value": "return" }, { "label": "消耗", "value": "consume" }, { "label": "冲销", "value": "reverse" }] }
            ],
            "actions": [
              { "code": "submit", "label": "筛选", "type": "submit", "status": "primary", "icon": "ri-search-line" },
              { "code": "reset", "label": "重置", "type": "reset", "icon": "ri-refresh-line" }
            ]
          }
        },
        {
          "id": "mes-material-ledger-grid",
          "kind": "grid",
          "materialVersion": "1.0.0",
          "sourceKey": "materialLedger",
          "sourceType": "custom",
          "tableType": "main",
          "schema": {
            "grid": {
              "border": true,
              "stripe": true,
              "showOverflow": "tooltip",
              "height": 550,
              "rowConfig": { "keyField": "id", "isCurrent": true },
              "columns": [
                { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                { "field": "work_order_no", "title": "工单号", "minWidth": 170, "fixed": "left" },
                { "field": "operation_name", "title": "工序", "minWidth": 150, "fixed": "left" },
                { "field": "item_name", "title": "物料", "minWidth": 180, "fixed": "left" },
                { "field": "transaction_type", "title": "事务类型", "width": 104, "align": "center", "formatter": { "type": "enum", "map": { "issue": "投料", "return": "退料", "consume": "消耗", "reverse": "冲销" }, "emptyText": "-" } },
                { "field": "quantity", "title": "数量", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                { "field": "uom", "title": "单位", "width": 86 },
                { "field": "lot_no", "title": "批次号", "minWidth": 145 },
                { "field": "serial_no", "title": "序列号", "minWidth": 155 },
                { "field": "reason_code", "title": "原因", "minWidth": 160 },
                { "field": "original_transaction_id", "title": "原事务", "minWidth": 230 },
                { "field": "reversal_transaction_id", "title": "冲销事务", "minWidth": 230 },
                { "field": "operator_id", "title": "操作人", "minWidth": 230 },
                { "field": "device_id", "title": "设备", "minWidth": 130 },
                { "field": "occurred_at", "title": "发生时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                { "title": "操作", "width": 116, "fixed": "right", "slots": { "default": "actions" } }
              ]
            },
            "rowActions": {
              "edit": false,
              "delete": false,
              "actions": [
                {
                  "code": "reverse-material",
                  "label": "反向事务",
                  "icon": "ri-arrow-go-back-line",
                  "status": "danger",
                  "permissionCode": "mes.execution.manage",
                  "directives": [
                    {
                      "type": "openGlobalDialog",
                      "model": { "transactionId": "{{ row.id }}", "expectedOperationVersion": "{{ row.operation_row_version }}", "reasonCode": "" },
                      "config": {
                        "title": "物料反向事务",
                        "width": 560,
                        "showFooter": true,
                        "form": { "schema": { "columns": 1, "fields": [{ "field": "reasonCode", "label": "反向原因", "component": "vxe-input", "span": 1, "props": { "clearable": true }, "rules": [{ "required": true, "message": "请输入反向原因" }] }], "actions": [] } },
                        "actions": [{ "code": "cancel", "label": "取消", "role": "cancel" }, { "code": "confirm", "label": "确认反向", "role": "confirm", "status": "danger" }]
                      },
                      "confirmDirectives": [
                        { "type": "invokeService", "serviceName": "mes", "serviceMethod": "reverseMaterial", "postData": { "transactionId": "{{ event.values.transactionId }}", "expectedOperationVersion": "{{ event.values.expectedOperationVersion }}", "reasonCode": "{{ event.values.reasonCode }}" } },
                        { "type": "refreshDataSource", "sourceKeys": ["materialLedger"] },
                        { "type": "showMessage", "status": "success", "message": "物料事务已反向。" }
                      ]
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
    $json$::jsonb
  )
)
insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
)
select
  seed.code,
  seed.route,
  seed.title,
  seed.description,
  coalesce(seed.schema->>'pageType', 'custom'),
  'dashboard',
  'published',
  true,
  seed.schema,
  1,
  timezone('utc'::text, now())
from page_seed seed
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
    then public.lowcode_pages.version + 1
    else public.lowcode_pages.version
  end,
  published_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select page.id, page.version, page.schema, page.published_at
from public.lowcode_pages page
where page.code in (
  'mes_release_console',
  'mes_execution_console',
  'mes_production_ledger',
  'mes_material_ledger'
)
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'production-root', '生产管理', '/dashboard/production/_group', business_root.id,
  'group', 'ri-factory-line', null, 'mes.execution.view', true, true,
  'dashboard', 'active', 37, '{"module":"mes","navigation":"sidebar"}'::jsonb
from public.admin_routes business_root
where business_root.code = 'business-root'
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

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  seed.code,
  seed.title,
  seed.path,
  parent.id,
  'page',
  seed.icon,
  seed.page_code,
  'mes.execution.view',
  true,
  true,
  'dashboard',
  'active',
  seed.sort_order,
  jsonb_build_object('module', 'mes', 'pageKind', 'lowcode')
from public.admin_routes parent
cross join (
  values
    ('production-release', '计划释放', '/dashboard/production/release', 'ri-send-plane-line', 'mes_release_console', 10),
    ('production-execution', '生产执行工作台', '/dashboard/production/execution', 'ri-dashboard-3-line', 'mes_execution_console', 20),
    ('production-ledger', '生产事务', '/dashboard/production/production-ledger', 'ri-file-list-3-line', 'mes_production_ledger', 30),
    ('production-material-ledger', '物料追溯', '/dashboard/production/material-ledger', 'ri-route-line', 'mes_material_ledger', 40)
) as seed(code, title, path, icon, page_code, sort_order)
where parent.code = 'production-root'
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

select pg_notify('pgrst', 'reload schema');

commit;
