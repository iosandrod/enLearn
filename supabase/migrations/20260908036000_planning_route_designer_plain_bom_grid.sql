-- Replace the route-designer BOM material with the standard low-code grid.
begin;

with bom_block as (
  select $block$
  {
    "id": "records-grid",
    "kind": "grid",
    "title": "BOM 结构",
    "height": "360px",
    "sourceKey": "records-grid",
    "tableType": "default",
    "sourceType": "custom",
    "description": "查看 BOM 结构，并在操作列中查看物料可用工艺路线。",
    "schema": {
      "grid": {
        "border": true,
        "stripe": true,
        "height": "360px",
        "showOverflow": "tooltip",
        "rowConfig": { "keyField": "id", "isCurrent": true },
        "treeConfig": {
          "transform": false,
          "rowField": "id",
          "childrenField": "children",
          "expandAll": true,
          "showLine": true
        },
        "columnConfig": { "resizable": true },
        "menuConfig": { "enabled": true, "body": true, "header": true },
        "columns": [
          { "field": "title", "title": "BOM", "treeNode": true, "minWidth": 260 },
          { "field": "quantity", "title": "用量", "width": 100 },
          { "field": "uom", "title": "单位", "width": 90 },
          {
            "title": "操作",
            "width": 190,
            "fixed": "right",
            "visible": false,
            "slots": { "default": "actions" }
          }
        ]
      },
      "rowActions": {
        "edit": false,
        "delete": false,
        "actions": [
          {
            "code": "view-bom-routes",
            "label": "查看工艺路线",
            "status": "primary",
            "visible": { "field": "entityType", "operator": "eq", "value": "item" },
            "script": "return this.executeFunction({ name: \"viewBomRoutes\", args: { materialId: this.event.row.entityId, materialName: this.event.row.title, row: this.event.row } });"
          },
          {
            "code": "create-bom-route",
            "label": "新增路线",
            "status": "primary",
            "visible": { "field": "entityType", "operator": "eq", "value": "item" },
            "script": "return this.executeFunction({ name: \"newRoute\", args: { materialId: this.event.row.entityId } });"
          }
        ]
      }
    }
  }
  $block$::jsonb as schema
)
update public.lowcode_pages page
set schema = jsonb_set(
      jsonb_set(
        page.schema,
        '{blocks,0,blocks,0,blocks,1}',
        (select schema from bom_block),
        true
      ),
      '{eventHandlers}',
      coalesce(
          (
            select jsonb_agg(handler)
            from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
            where handler->>'event' not in ('planningBom.routeSelect', 'planningBom.createRoute')
          ),
          '[]'::jsonb
        ) || jsonb_build_array(
          jsonb_build_object(
            'event', 'planningBom.routeSelect',
            'blockId', 'records-grid',
            'directives', jsonb_build_array(
              jsonb_build_object(
                'type', 'setSearchFilters',
                'sourceKey', 'planning_route_designer_flow',
                'mode', 'replace',
                'values', jsonb_build_object('operationId', '{{ event.route.id }}')
              )
            )
          )
        ),
      true
    ),
  version = page.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where page.code = 'planning_route_designer'
  and page.schema #>> '{blocks,0,blocks,0,blocks,1,id}' = 'records-grid';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_route_designer'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'planning_bom_route_picker', '/dashboard/planning/bom-route-picker',
  '选择工艺路线', '选择能够产出当前物料的工艺路线。', 'custom', 'dashboard',
  'published', false, $schema$
  {
    "schemaVersion": 1,
    "code": "planning_bom_route_picker",
    "route": "/dashboard/planning/bom-route-picker",
    "title": "选择工艺路线",
    "pageType": "custom",
    "description": "选择能够产出当前物料的工艺路线。",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "dataSources": {
      "routes": {
        "key": "routes",
        "label": "可用工艺路线",
        "sourceType": "custom",
        "serviceName": "planning",
        "serviceMethod": "getPlanningConsoleOptions",
        "postData": { "optionType": "route", "itemId": "{{ route.query.itemId }}" },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "planning_bom_route_picker_grid",
        "kind": "grid",
        "tableType": "main",
        "title": "可选工艺路线",
        "sourceKey": "routes",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "height": 360,
            "showOverflow": "tooltip",
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columnConfig": { "resizable": true },
            "menuConfig": { "enabled": true, "body": true, "header": true },
            "columns": [
              { "type": "seq", "title": "序号", "width": 64, "align": "center" },
              { "field": "label", "title": "路线名称", "minWidth": 260, "fixed": "left" },
              { "field": "id", "title": "路线编号", "minWidth": 240 }
            ]
          },
          "rowActions": { "edit": false, "delete": false }
        }
      }
    ]
  }
  $schema$::jsonb, 1, timezone('utc'::text, now())
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
    version = case
      when public.lowcode_pages.schema is distinct from excluded.schema
        or public.lowcode_pages.route is distinct from excluded.route
      then public.lowcode_pages.version + 1
      else public.lowcode_pages.version
    end,
    published_at = case
      when public.lowcode_pages.schema is distinct from excluded.schema
        or public.lowcode_pages.route is distinct from excluded.route
      then excluded.published_at
      else public.lowcode_pages.published_at
    end,
    updated_at = case
      when public.lowcode_pages.schema is distinct from excluded.schema
        or public.lowcode_pages.route is distinct from excluded.route
      then timezone('utc'::text, now())
      else public.lowcode_pages.updated_at
    end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_bom_route_picker'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
commit;
