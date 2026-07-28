-- Store notification operation pages as low-code schemas.

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema,
  published_at
) values (
  'notification-message-center',
  '/dashboard/messages',
  '消息中心',
  '统一查看站内消息、审批通知和系统提醒。',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "notification-message-center",
    "route": "/dashboard/messages",
    "title": "消息中心",
    "pageType": "list",
    "description": "统一查看站内消息、审批通知和系统提醒。",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "messages": {
        "key": "messages",
        "label": "消息列表",
        "serviceName": "notification",
        "serviceMethod": "listMessages",
        "postData": { "pageSize": 100 }
      },
      "preferences": {
        "key": "preferences",
        "label": "通知偏好",
        "serviceName": "notification",
        "serviceMethod": "getPreferences"
      },
      "selectedMessageRows": {
        "key": "selectedMessageRows",
        "label": "当前消息明细",
        "serviceName": "notification",
        "serviceMethod": "listMessages",
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "message-actions",
        "kind": "buttonGroup",
        "title": "消息操作",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "refresh",
            "label": "刷新",
            "status": "primary",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["messages", "preferences"] }
            ]
          },
          {
            "code": "markAllRead",
            "label": "全部已读",
            "status": "success",
            "icon": "ri-check-double-line",
            "directives": [
              {
                "type": "invokeService",
                "serviceName": "notification",
                "serviceMethod": "markAllRead",
                "postData": {}
              },
              { "type": "refreshDataSource", "sourceKeys": ["messages"] },
              { "type": "showMessage", "message": "已标记全部消息为已读。" }
            ]
          }
        ]
      },
      {
        "id": "message-grid",
        "kind": "grid",
        "title": "数据列表",
        "description": "点击一行后，下方明细 tab 会显示当前消息。",
        "sourceKey": "messages",
        "layout": { "fillRemaining": true },
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": "tooltip",
            "height": 420,
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columns": [
              { "field": "read_status", "title": "状态", "width": 90, "align": "center" },
              { "field": "category_label", "title": "分类", "width": 120 },
              { "field": "title", "title": "标题", "minWidth": 220 },
              { "field": "content", "title": "内容", "minWidth": 320 },
              { "field": "priority_label", "title": "优先级", "width": 100, "align": "center" },
              {
                "field": "created_at",
                "title": "创建时间",
                "minWidth": 180,
                "formatter": { "type": "datetime", "locale": "zh-CN" }
              },
              { "title": "操作", "width": 160, "fixed": "right", "slots": { "default": "actions" } }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false,
            "actions": [
              {
                "code": "markRead",
                "label": "已读",
                "status": "primary",
                "directives": [
                  {
                    "type": "invokeService",
                    "serviceName": "notification",
                    "serviceMethod": "markRead",
                    "postData": { "id": "{{ row.id }}" }
                  },
                  { "type": "refreshDataSource", "sourceKeys": ["messages"] }
                ]
              },
              {
                "code": "archive",
                "label": "归档",
                "status": "warning",
                "directives": [
                  {
                    "type": "invokeService",
                    "serviceName": "notification",
                    "serviceMethod": "archiveMessage",
                    "postData": { "id": "{{ row.id }}" }
                  },
                  { "type": "refreshDataSource", "sourceKeys": ["messages"] }
                ]
              }
            ]
          },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedMessageRows",
                "value": ["{{ event.row }}"]
              }
            ]
          }
        }
      },
      {
        "id": "message-detail-tabs",
        "kind": "tabs",
        "title": "明细表",
        "defaultKey": "messageDetail",
        "tabs": [
          {
            "key": "messageDetail",
            "label": "消息明细",
            "blocks": [
              {
                "id": "selected-message-grid",
                "kind": "grid",
                "sourceKey": "selectedMessageRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "showOverflow": "tooltip",
                    "height": 220,
                    "rowConfig": { "keyField": "id" },
                    "columns": [
                      { "field": "title", "title": "标题", "minWidth": 220 },
                      { "field": "content", "title": "内容", "minWidth": 360 },
                      { "field": "link_url", "title": "链接", "minWidth": 220 },
                      { "field": "source_type", "title": "来源类型", "width": 120 },
                      { "field": "source_id", "title": "来源 ID", "minWidth": 180 }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          },
          {
            "key": "preferences",
            "label": "通知偏好",
            "blocks": [
              {
                "id": "message-preferences-grid",
                "kind": "grid",
                "sourceKey": "preferences",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "height": 260,
                    "rowConfig": { "keyField": "category" },
                    "columns": [
                      { "field": "category_label", "title": "分类", "minWidth": 160 },
                      { "field": "inbox_enabled", "title": "站内信", "width": 100, "align": "center" },
                      { "field": "email_enabled", "title": "邮件", "width": 100, "align": "center" },
                      { "field": "sms_enabled", "title": "短信", "width": 100, "align": "center" }
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
  published_at = excluded.published_at,
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema,
  published_at
) values (
  'notification-deliveries',
  '/dashboard/notification-deliveries',
  '投递记录',
  '查看邮件、短信投递状态和失败重试记录。',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "notification-deliveries",
    "route": "/dashboard/notification-deliveries",
    "title": "投递记录",
    "pageType": "list",
    "description": "查看邮件、短信投递状态和失败重试记录。",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "deliveries": {
        "key": "deliveries",
        "label": "投递列表",
        "serviceName": "notification",
        "serviceMethod": "listDeliveries",
        "postData": { "pageSize": 100 }
      },
      "selectedDeliveryRows": {
        "key": "selectedDeliveryRows",
        "label": "当前投递明细",
        "serviceName": "notification",
        "serviceMethod": "listDeliveries",
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "delivery-actions",
        "kind": "buttonGroup",
        "title": "投递操作",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "refresh",
            "label": "刷新",
            "status": "primary",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["deliveries"] }
            ]
          }
        ]
      },
      {
        "id": "delivery-grid",
        "kind": "grid",
        "title": "数据列表",
        "description": "点击一行后，下方明细 tab 会显示当前投递记录。",
        "sourceKey": "deliveries",
        "layout": { "fillRemaining": true },
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": "tooltip",
            "height": 420,
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columns": [
              { "field": "channel_label", "title": "渠道", "width": 90, "align": "center" },
              { "field": "target", "title": "目标", "minWidth": 220 },
              { "field": "status_label", "title": "状态", "width": 100, "align": "center" },
              { "field": "attempt_count", "title": "尝试次数", "width": 100, "align": "center" },
              {
                "field": "next_retry_at",
                "title": "下次重试",
                "minWidth": 180,
                "formatter": { "type": "datetime", "locale": "zh-CN" }
              },
              { "field": "error_message", "title": "错误信息", "minWidth": 260 },
              {
                "field": "created_at",
                "title": "创建时间",
                "minWidth": 180,
                "formatter": { "type": "datetime", "locale": "zh-CN" }
              },
              { "title": "操作", "width": 110, "fixed": "right", "slots": { "default": "actions" } }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false,
            "actions": [
              {
                "code": "retry",
                "label": "重试",
                "status": "warning",
                "directives": [
                  {
                    "type": "invokeService",
                    "serviceName": "notification",
                    "serviceMethod": "retryDelivery",
                    "postData": { "id": "{{ row.id }}" }
                  },
                  { "type": "refreshDataSource", "sourceKeys": ["deliveries"] }
                ]
              }
            ]
          },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedDeliveryRows",
                "value": ["{{ event.row }}"]
              }
            ]
          }
        }
      },
      {
        "id": "delivery-detail-tabs",
        "kind": "tabs",
        "title": "明细表",
        "defaultKey": "deliveryDetail",
        "tabs": [
          {
            "key": "deliveryDetail",
            "label": "投递明细",
            "blocks": [
              {
                "id": "selected-delivery-grid",
                "kind": "grid",
                "sourceKey": "selectedDeliveryRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "showOverflow": "tooltip",
                    "height": 240,
                    "rowConfig": { "keyField": "id" },
                    "columns": [
                      { "field": "message_id", "title": "消息 ID", "minWidth": 220 },
                      { "field": "recipient_id", "title": "接收人", "minWidth": 220 },
                      { "field": "template_code", "title": "模板", "minWidth": 180 },
                      { "field": "provider_message_id", "title": "服务商消息 ID", "minWidth": 220 },
                      {
                        "field": "sent_at",
                        "title": "发送时间",
                        "minWidth": 180,
                        "formatter": { "type": "datetime", "locale": "zh-CN" }
                      }
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
  published_at = excluded.published_at,
  updated_at = timezone('utc'::text, now());

update public.admin_routes
set
  title = '消息中心',
  page_code = 'notification-message-center',
  updated_at = timezone('utc'::text, now())
where code = 'notification-message-center';

update public.admin_routes
set
  title = '投递记录',
  page_code = 'notification-deliveries',
  updated_at = timezone('utc'::text, now())
where code = 'notification-deliveries';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('notification-message-center', 'notification-deliveries')
on conflict (page_id, version) do nothing;
