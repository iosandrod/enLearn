-- Route the approval workflow designer through the low-code page renderer.
begin;
create temporary table _approval_workflow_route_refs on commit drop as
select id
from public.admin_routes
where page_code = (
  select code from public.lowcode_pages
  where route = '/dashboard/workflow/designer'
  limit 1
);
update public.admin_routes
set page_code = null
where id in (select id from _approval_workflow_route_refs);
insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'approval-workflow-designer', '/dashboard/workflow/designer', '审批流设计器',
  '由低代码按钮组和审批流画布物料组成的审批流设计器。', 'custom', 'blank',
  'published', true,
  $json$
  {
    "schemaVersion": 1,
    "code": "approval-workflow-designer",
    "route": "/dashboard/workflow/designer",
    "title": "审批流设计器",
    "pageType": "custom",
    "layout": "blank",
    "status": "published",
    "keepAlive": true,
    "dataSources": {},
    "blocks": [
      {
        "id": "approval-workflow-toolbar",
        "kind": "buttonGroup",
        "align": "right",
        "gap": 8,
        "actions": [
          { "code": "approval-workflow-new", "label": "新建草稿", "icon": "ri-file-add-line", "eventName": "workflow.new" },
          { "code": "approval-workflow-save", "label": "保存并发布", "status": "primary", "icon": "ri-save-3-line", "eventName": "workflow.save" },
          { "code": "approval-workflow-layout", "label": "自动布局", "icon": "ri-flow-chart", "eventName": "workflow.layout" }
        ]
      },
      {
        "id": "approval-workflow-flow",
        "kind": "approval-workflow-designer",
        "materialVersion": "1.0.0",
        "sourceKey": "workflowModel"
      }
    ]
  }
  $json$::jsonb,
  1, timezone('utc'::text, now())
 )
on conflict (route) do update set
  code = excluded.code,
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
update public.admin_routes
set page_code = 'approval-workflow-designer'
where id in (select id from _approval_workflow_route_refs);
commit;
