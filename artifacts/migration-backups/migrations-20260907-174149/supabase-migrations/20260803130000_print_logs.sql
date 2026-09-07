-- Persist print execution logs and expose them through a low-code archive page.

create table if not exists public.print_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  request_id text,
  job_id text,
  template_id uuid references public.print_templates(id) on delete set null,
  template_name text not null,
  template_version integer check (template_version is null or template_version > 0),
  document_name text,
  printer_id text,
  printer_name text,
  source_type text,
  source_id text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'canceled')),
  copies integer not null default 1 check (copies > 0),
  page_count integer not null default 0 check (page_count >= 0),
  message text,
  error_code text,
  error_message text,
  input_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_data) = 'object'),
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  requested_by uuid references auth.users(id) on delete set null,
  queued_at timestamp with time zone not null default timezone('utc'::text, now()),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  check (length(btrim(template_name)) > 0),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

drop trigger if exists set_print_logs_updated_at on public.print_logs;
create trigger set_print_logs_updated_at
before update on public.print_logs
for each row
execute function public.set_updated_at();

create unique index if not exists idx_print_logs_tenant_request
  on public.print_logs (tenant_id, request_id)
  where request_id is not null;

create index if not exists idx_print_logs_status_created
  on public.print_logs (tenant_id, status, created_at desc);

create index if not exists idx_print_logs_template_created
  on public.print_logs (tenant_id, template_id, created_at desc);

create index if not exists idx_print_logs_printer_created
  on public.print_logs (tenant_id, printer_id, created_at desc);

create index if not exists idx_print_logs_source
  on public.print_logs (tenant_id, source_type, source_id, created_at desc);

alter table public.print_logs enable row level security;

grant select on public.print_logs to authenticated;
grant select, insert, update, delete on public.print_logs to service_role;

drop policy if exists "Permission holders can view print logs"
  on public.print_logs;
create policy "Permission holders can view print logs"
on public.print_logs
for select
to authenticated
using (public.has_app_permission('print.logs.view'));

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
) values (
  'print_logs',
  U&'\6253\5370\65E5\5FD7',
  'public.print_logs',
  '/dashboard/print/logs',
  null,
  'ri-file-list-3-line',
  'Print execution history, printer result, timing, and error details.',
  'id',
  'active',
  221,
  '{
    "readPermissions": ["print.logs.view"],
    "list": {
      "orderBy": "created_at",
      "orderDirection": "desc",
      "searchFields": [
        "template_name",
        "document_name",
        "printer_name",
        "source_id",
        "status",
        "message",
        "error_message"
      ]
    }
  }'::jsonb
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
  'print-logs',
  '/dashboard/print/logs',
  U&'\6253\5370\65E5\5FD7',
  U&'\6253\5370\4EFB\52A1\6267\884C\65E5\5FD7\4E0E\9519\8BEF\8BE6\60C5\3002',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "print-logs",
    "route": "/dashboard/print/logs",
    "title": "打印日志",
    "description": "打印任务执行日志与错误详情。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "printLogs": {
        "key": "printLogs",
        "label": "打印日志",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "entityCode": "print_logs",
        "tableName": "print_logs",
        "postData": {
          "entityCode": "print_logs",
          "tableName": "print_logs",
          "sorts": [
            { "field": "created_at", "direction": "desc" },
            { "field": "queued_at", "direction": "desc" }
          ],
          "limit": 1000
        },
        "autoLoad": true
      },
      "selectedPrintLogRows": {
        "key": "selectedPrintLogRows",
        "label": "当前打印日志",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "entityCode": "print_logs",
        "tableName": "print_logs",
        "postData": {
          "entityCode": "print_logs",
          "tableName": "print_logs",
          "filters": { "id": "__none__" },
          "limit": 1
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "print-log-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all-print-logs",
            "label": "全部日志",
            "status": "primary",
            "icon": "ri-list-check-2",
            "eventName": "printLog.actions.showAll",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printLogs",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-processing-print-logs",
            "label": "执行中",
            "icon": "ri-loader-4-line",
            "eventName": "printLog.actions.showProcessing",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printLogs",
                "mode": "replace",
                "values": { "status": "processing" }
              }
            ]
          },
          {
            "code": "show-succeeded-print-logs",
            "label": "成功",
            "icon": "ri-checkbox-circle-line",
            "eventName": "printLog.actions.showSucceeded",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printLogs",
                "mode": "replace",
                "values": { "status": "succeeded" }
              }
            ]
          },
          {
            "code": "show-failed-print-logs",
            "label": "失败",
            "icon": "ri-error-warning-line",
            "eventName": "printLog.actions.showFailed",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printLogs",
                "mode": "replace",
                "values": { "status": "failed" }
              }
            ]
          },
          {
            "code": "show-canceled-print-logs",
            "label": "已取消",
            "icon": "ri-close-circle-line",
            "eventName": "printLog.actions.showCanceled",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printLogs",
                "mode": "replace",
                "values": { "status": "canceled" }
              }
            ]
          },
          {
            "code": "reload-print-logs",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "eventName": "printLog.actions.reload",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["printLogs"]
              }
            ]
          }
        ]
      },
      {
        "id": "print-log-main-grid",
        "kind": "grid",
        "sourceKey": "printLogs",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 360,
            "rowConfig": {
              "keyField": "id",
              "isCurrent": true
            },
            "columns": [
              {
                "type": "seq",
                "title": "序号",
                "width": 64,
                "align": "center"
              },
              {
                "field": "created_at",
                "title": "时间",
                "width": 180,
                "fixed": "left",
                "sortable": true,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              },
              {
                "field": "template_name",
                "title": "模板",
                "minWidth": 200,
                "fixed": "left",
                "showOverflow": "tooltip"
              },
              {
                "field": "document_name",
                "title": "文档",
                "minWidth": 180,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "printer_name",
                "title": "打印机",
                "minWidth": 160,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "status",
                "title": "状态",
                "width": 100,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "queued": "排队中",
                    "processing": "执行中",
                    "succeeded": "成功",
                    "failed": "失败",
                    "canceled": "已取消"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "copies",
                "title": "份数",
                "width": 80,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "1"
                }
              },
              {
                "field": "page_count",
                "title": "页数",
                "width": 80,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "0"
                }
              },
              {
                "field": "source_type",
                "title": "来源类型",
                "minWidth": 120,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "source_id",
                "title": "来源单号",
                "minWidth": 160,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "duration_ms",
                "title": "耗时(ms)",
                "width": 110,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              },
              {
                "field": "message",
                "title": "消息",
                "minWidth": 220,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false
          },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedPrintLog",
                "value": "{{ event.row }}"
              },
              {
                "type": "setDataSource",
                "sourceKey": "selectedPrintLogRows",
                "value": ["{{ event.row }}"]
              }
            ]
          }
        }
      },
      {
        "id": "print-log-child-tabs",
        "kind": "tabs",
        "defaultKey": "execution-fields",
        "tabs": [
          {
            "key": "execution-fields",
            "label": "执行信息",
            "blocks": [
              {
                "id": "print-log-execution-grid",
                "kind": "grid",
                "sourceKey": "selectedPrintLogRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "id",
                        "title": "日志ID",
                        "minWidth": 280,
                        "fixed": "left",
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "request_id",
                        "title": "请求ID",
                        "minWidth": 200,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "job_id",
                        "title": "任务ID",
                        "minWidth": 200,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "template_id",
                        "title": "模板ID",
                        "minWidth": 280,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "template_version",
                        "title": "模板版本",
                        "width": 110,
                        "align": "right",
                        "formatter": {
                          "type": "number",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "tenant_id",
                        "title": "租户",
                        "minWidth": 120,
                        "showOverflow": "tooltip"
                      }
                    ]
                  },
                  "rowActions": {
                    "edit": false,
                    "delete": false
                  }
                }
              }
            ]
          },
          {
            "key": "timing-fields",
            "label": "打印与耗时",
            "blocks": [
              {
                "id": "print-log-timing-grid",
                "kind": "grid",
                "sourceKey": "selectedPrintLogRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "printer_id",
                        "title": "打印机ID",
                        "minWidth": 180,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "printer_name",
                        "title": "打印机名称",
                        "minWidth": 180,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "queued_at",
                        "title": "排队时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "started_at",
                        "title": "开始时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "finished_at",
                        "title": "结束时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "duration_ms",
                        "title": "耗时(ms)",
                        "width": 120,
                        "align": "right",
                        "formatter": {
                          "type": "number",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      }
                    ]
                  },
                  "rowActions": {
                    "edit": false,
                    "delete": false
                  }
                }
              }
            ]
          },
          {
            "key": "error-fields",
            "label": "错误与审计",
            "blocks": [
              {
                "id": "print-log-error-grid",
                "kind": "grid",
                "sourceKey": "selectedPrintLogRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "error_code",
                        "title": "错误码",
                        "minWidth": 140,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "error_message",
                        "title": "错误信息",
                        "minWidth": 360,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "requested_by",
                        "title": "发起人",
                        "minWidth": 260,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "created_at",
                        "title": "创建时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "updated_at",
                        "title": "更新时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      }
                    ]
                  },
                  "rowActions": {
                    "edit": false,
                    "delete": false
                  }
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
where code = 'print-logs'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.admin_entities
set
  page_code = 'print-logs',
  updated_at = timezone('utc'::text, now())
where code = 'print_logs';

update public.admin_permissions
set
  resource_type = 'entity',
  resource_key = 'print_logs',
  route_path = '/dashboard/print/logs',
  page_code = 'print-logs',
  entity_code = 'print_logs',
  updated_at = timezone('utc'::text, now())
where code = 'print.logs.view';

update public.admin_routes as log_route
set
  title = U&'\6253\5370\65E5\5FD7',
  path = '/dashboard/print/logs',
  parent_id = print_root.id,
  page_code = 'print-logs',
  permission_code = 'print.logs.view',
  icon = 'ri-file-list-3-line',
  visible = true,
  keep_alive = true,
  layout = 'dashboard',
  status = 'active',
  sort_order = 20,
  metadata = coalesce(log_route.metadata, '{}'::jsonb)
    || '{"group":"lowcode-app","category":"print","module":"print","pageKind":"logs"}'::jsonb,
  updated_at = timezone('utc'::text, now())
from public.admin_routes as print_root
where log_route.code = 'print-logs'
  and print_root.code = 'print-management-root';

select pg_notify('pgrst', 'reload schema');
