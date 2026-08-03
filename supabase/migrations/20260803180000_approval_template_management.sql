-- Add approval template management to the database-driven sidebar.

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
  'approval-templates',
  '/dashboard/approval/templates',
  U&'\5BA1\6279\6A21\677F\7BA1\7406',
  U&'\5BA1\6279\6D41\7A0B\6A21\677F\6863\6848\3001\7248\672C\72B6\6001\4E0E\5BA1\8BA1\4FE1\606F\3002',
  'list',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "approval-templates",
    "route": "/dashboard/approval/templates",
    "title": "审批模板管理",
    "description": "审批流程模板档案、版本状态与审计信息。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "approvalTemplates": {
        "key": "approvalTemplates",
        "label": "审批模板",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "models",
          "tenantId": "default"
        },
        "autoLoad": true
      },
      "selectedApprovalTemplateRows": {
        "key": "selectedApprovalTemplateRows",
        "label": "当前审批模板",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "models",
          "tenantId": "default"
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "approval-template-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all-templates",
            "label": "全部模板",
            "status": "primary",
            "icon": "ri-list-check-2",
            "eventName": "approvalTemplate.actions.showAll",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalTemplates",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-published-templates",
            "label": "已发布",
            "icon": "ri-checkbox-circle-line",
            "eventName": "approvalTemplate.actions.showPublished",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalTemplates",
                "mode": "replace",
                "values": { "status": "published" }
              }
            ]
          },
          {
            "code": "show-draft-templates",
            "label": "草稿",
            "icon": "ri-draft-line",
            "eventName": "approvalTemplate.actions.showDraft",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalTemplates",
                "mode": "replace",
                "values": { "status": "draft" }
              }
            ]
          },
          {
            "code": "show-disabled-templates",
            "label": "已停用",
            "icon": "ri-forbid-line",
            "eventName": "approvalTemplate.actions.showDisabled",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalTemplates",
                "mode": "replace",
                "values": { "status": "disabled" }
              }
            ]
          },
          {
            "code": "reload-approval-templates",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "eventName": "approvalTemplate.actions.reload",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["approvalTemplates"]
              }
            ]
          },
          {
            "code": "create-approval-template",
            "label": "新建模板",
            "status": "success",
            "icon": "ri-add-line",
            "route": "/dashboard/workflow/designer"
          }
        ]
      },
      {
        "id": "approval-template-main-grid",
        "kind": "grid",
        "sourceKey": "approvalTemplates",
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
                "field": "code",
                "title": "模板编码",
                "minWidth": 220,
                "fixed": "left",
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "name",
                "title": "模板名称",
                "minWidth": 220,
                "fixed": "left",
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "documentType",
                "title": "业务类型",
                "minWidth": 160,
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                },
                "showOverflow": "tooltip"
              },
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
                    "disabled": "已停用",
                    "archived": "已归档"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "currentVersion",
                "title": "当前版本",
                "width": 110,
                "align": "right",
                "sortable": true,
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "0"
                }
              },
              {
                "field": "updatedBy",
                "title": "更新人",
                "minWidth": 260,
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                },
                "showOverflow": "tooltip"
              },
              {
                "field": "updatedAt",
                "title": "更新时间",
                "width": 180,
                "sortable": true,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              },
              {
                "title": "操作",
                "width": 110,
                "fixed": "right",
                "slots": { "default": "actions" }
              }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false,
            "actions": [
              {
                "code": "design",
                "label": "设计",
                "status": "primary",
                "icon": "ri-edit-box-line",
                "eventName": "approvalTemplate.actions.design",
                "directives": [
                  {
                    "type": "navigate",
                    "route": "/dashboard/workflow/designer/{{ row.id }}"
                  }
                ]
              }
            ]
          },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedApprovalTemplate",
                "value": "{{ event.row }}"
              },
              {
                "type": "setDataSource",
                "sourceKey": "selectedApprovalTemplateRows",
                "value": ["{{ event.row }}"]
              }
            ],
            "rowDblclick": [
              {
                "type": "navigate",
                "route": "/dashboard/workflow/designer/{{ row.id }}"
              }
            ]
          }
        }
      },
      {
        "id": "approval-template-child-tabs",
        "kind": "tabs",
        "defaultKey": "template-detail",
        "tabs": [
          {
            "key": "template-detail",
            "label": "模板明细",
            "blocks": [
              {
                "id": "approval-template-detail-grid",
                "kind": "grid",
                "sourceKey": "selectedApprovalTemplateRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 240,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "id",
                        "title": "模板ID",
                        "minWidth": 280,
                        "fixed": "left",
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "tenantId",
                        "title": "租户",
                        "width": 120,
                        "formatter": {
                          "type": "text",
                          "emptyText": "default"
                        }
                      },
                      {
                        "field": "code",
                        "title": "模板编码",
                        "minWidth": 220,
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "name",
                        "title": "模板名称",
                        "minWidth": 220,
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "documentType",
                        "title": "业务类型",
                        "minWidth": 160,
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
                            "draft": "草稿",
                            "published": "已发布",
                            "disabled": "已停用",
                            "archived": "已归档"
                          },
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "currentVersion",
                        "title": "当前版本",
                        "width": 110,
                        "align": "right",
                        "formatter": {
                          "type": "number",
                          "locale": "zh-CN",
                          "emptyText": "0"
                        }
                      },
                      {
                        "field": "createdBy",
                        "title": "创建人",
                        "minWidth": 260,
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        },
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "updatedBy",
                        "title": "更新人",
                        "minWidth": 260,
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        },
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "createdAt",
                        "title": "创建时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "updatedAt",
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
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

-- Keep localized schema text independent from the SQL client's input encoding.
update public.lowcode_pages
set schema = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                jsonb_set(
                                  jsonb_set(
                                    jsonb_set(
                                      jsonb_set(
                                        jsonb_set(
                                          jsonb_set(
                                            jsonb_set(
                                              jsonb_set(
                                                schema,
                                                '{title}',
                                                to_jsonb(U&'\5BA1\6279\6A21\677F\7BA1\7406'::text),
                                                true
                                              ),
                                              '{description}',
                                              to_jsonb(U&'\5BA1\6279\6D41\7A0B\6A21\677F\6863\6848\3001\7248\672C\72B6\6001\4E0E\5BA1\8BA1\4FE1\606F\3002'::text),
                                              true
                                            ),
                                            '{blocks,0,actions,0,label}',
                                            to_jsonb(U&'\5168\90E8\6A21\677F'::text),
                                            true
                                          ),
                                          '{blocks,0,actions,1,label}',
                                          to_jsonb(U&'\5DF2\53D1\5E03'::text),
                                          true
                                        ),
                                        '{blocks,0,actions,2,label}',
                                        to_jsonb(U&'\8349\7A3F'::text),
                                        true
                                      ),
                                      '{blocks,0,actions,3,label}',
                                      to_jsonb(U&'\5DF2\505C\7528'::text),
                                      true
                                    ),
                                    '{blocks,0,actions,4,label}',
                                    to_jsonb(U&'\5237\65B0'::text),
                                    true
                                  ),
                                  '{blocks,0,actions,5,label}',
                                  to_jsonb(U&'\65B0\5EFA\6A21\677F'::text),
                                  true
                                ),
                                '{blocks,1,schema,grid,columns,0,title}',
                                to_jsonb(U&'\5E8F\53F7'::text),
                                true
                              ),
                              '{blocks,1,schema,grid,columns,1,title}',
                              to_jsonb(U&'\6A21\677F\7F16\7801'::text),
                              true
                            ),
                            '{blocks,1,schema,grid,columns,2,title}',
                            to_jsonb(U&'\6A21\677F\540D\79F0'::text),
                            true
                          ),
                          '{blocks,1,schema,grid,columns,3,title}',
                          to_jsonb(U&'\4E1A\52A1\7C7B\578B'::text),
                          true
                        ),
                        '{blocks,1,schema,grid,columns,4,title}',
                        to_jsonb(U&'\72B6\6001'::text),
                        true
                      ),
                      '{blocks,1,schema,grid,columns,5,title}',
                      to_jsonb(U&'\5F53\524D\7248\672C'::text),
                      true
                    ),
                    '{blocks,1,schema,grid,columns,6,title}',
                    to_jsonb(U&'\66F4\65B0\4EBA'::text),
                    true
                  ),
                  '{blocks,1,schema,grid,columns,7,title}',
                  to_jsonb(U&'\66F4\65B0\65F6\95F4'::text),
                  true
                ),
                '{blocks,1,schema,grid,columns,8,title}',
                to_jsonb(U&'\64CD\4F5C'::text),
                true
              ),
              '{blocks,1,schema,rowActions,actions,0,label}',
              to_jsonb(U&'\8BBE\8BA1'::text),
              true
            ),
            '{blocks,2,tabs,0,label}',
            to_jsonb(U&'\6A21\677F\660E\7EC6'::text),
            true
          ),
          '{blocks,2,tabs,0,blocks,0,schema,grid,columns,0,title}',
          to_jsonb(U&'\6A21\677F\0049\0044'::text),
          true
        ),
        '{blocks,2,tabs,0,blocks,0,schema,grid,columns,1,title}',
        to_jsonb(U&'\79DF\6237'::text),
        true
      ),
      '{blocks,2,tabs,0,blocks,0,schema,grid,columns,2,title}',
      to_jsonb(U&'\6A21\677F\7F16\7801'::text),
      true
    ),
    '{blocks,2,tabs,0,blocks,0,schema,grid,columns,3,title}',
    to_jsonb(U&'\6A21\677F\540D\79F0'::text),
    true
  ),
  '{blocks,2,tabs,0,blocks,0,schema,grid,columns,4,title}',
  to_jsonb(U&'\4E1A\52A1\7C7B\578B'::text),
  true
)
where code = 'approval-templates';

update public.lowcode_pages
set schema = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            schema,
            '{blocks,2,tabs,0,blocks,0,schema,grid,columns,5,title}',
            to_jsonb(U&'\72B6\6001'::text),
            true
          ),
          '{blocks,2,tabs,0,blocks,0,schema,grid,columns,6,title}',
          to_jsonb(U&'\5F53\524D\7248\672C'::text),
          true
        ),
        '{blocks,2,tabs,0,blocks,0,schema,grid,columns,7,title}',
        to_jsonb(U&'\521B\5EFA\4EBA'::text),
        true
      ),
      '{blocks,2,tabs,0,blocks,0,schema,grid,columns,8,title}',
      to_jsonb(U&'\66F4\65B0\4EBA'::text),
      true
    ),
    '{blocks,2,tabs,0,blocks,0,schema,grid,columns,9,title}',
    to_jsonb(U&'\521B\5EFA\65F6\95F4'::text),
    true
  ),
  '{blocks,2,tabs,0,blocks,0,schema,grid,columns,10,title}',
  to_jsonb(U&'\66F4\65B0\65F6\95F4'::text),
  true
)
where code = 'approval-templates';

update public.lowcode_pages
set schema = replace(
  replace(
    replace(
      replace(
        schema::text,
        U&'\0022draft\0022: \0022??\0022',
        U&'\0022draft\0022: \0022\8349\7A3F\0022'
      ),
      U&'\0022published\0022: \0022???\0022',
      U&'\0022published\0022: \0022\5DF2\53D1\5E03\0022'
    ),
    U&'\0022disabled\0022: \0022???\0022',
    U&'\0022disabled\0022: \0022\5DF2\505C\7528\0022'
  ),
  U&'\0022archived\0022: \0022???\0022',
  U&'\0022archived\0022: \0022\5DF2\5F52\6863\0022'
)::jsonb
where code = 'approval-templates';

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
where code = 'approval-templates'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

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
  'approval-management-root',
  U&'\5BA1\6279\7BA1\7406',
  '/dashboard/approval/_group',
  parent.id,
  'group',
  'ri-file-shield-2-line',
  null,
  null,
  true,
  true,
  'dashboard',
  'active',
  45,
  '{"group":"approval","navigation":"sidebar"}'::jsonb
from public.admin_routes parent
where parent.code = 'business-root'
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
  'approval-template-management',
  U&'\5BA1\6279\6A21\677F\7BA1\7406',
  '/dashboard/approval/templates',
  parent.id,
  'page',
  'ri-flow-chart',
  'approval-templates',
  'workflow.definitions.manage',
  true,
  true,
  'dashboard',
  'active',
  10,
  '{"group":"approval","category":"templates"}'::jsonb
from public.admin_routes parent
where parent.code = 'approval-management-root'
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
