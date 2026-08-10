-- Add dedicated routing and BOM views to Planning > Basic Data.

begin;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'planning_routing_view', '/dashboard/planning/routing-view', '工艺路线',
  '查看工序顺序、依赖关系、投入物料和占用资源。', 'custom', 'dashboard', 'published', true,
  '{"schemaVersion":1,"code":"planning_routing_view","route":"/dashboard/planning/routing-view","title":"工艺路线","pageType":"custom","description":"查看工序顺序、依赖关系、投入物料和占用资源。","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"flow":{"key":"flow","label":"工艺路线图","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleData","postData":{"dataset":"flow","filters":{"itemId":"{{ forms.planning_routing_filter.itemId }}","resourceId":"{{ forms.planning_routing_filter.resourceId }}","operationId":"{{ forms.planning_routing_filter.operationId }}"}},"autoLoad":true},"itemOptions":{"key":"itemOptions","label":"物料选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"item"},"autoLoad":true},"resourceOptions":{"key":"resourceOptions","label":"资源选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"resource"},"autoLoad":true},"operationOptions":{"key":"operationOptions","label":"工序选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"operation"},"autoLoad":true}},"eventHandlers":[{"event":"planningFlow.nodeSelect","blockId":"planning_routing_flow","disabled":false,"directives":[{"type":"navigate","route":"/dashboard/planning/operation/edit?id={{ row.id }}&fromPage=planning_routing_view","disabled":false}]}],"blocks":[{"id":"planning_routing_filter","kind":"searchForm","title":"路线筛选","targetSourceKey":"flow","initialValues":{"itemId":"","resourceId":"","operationId":""},"schema":{"columns":3,"fields":[{"field":"itemId","label":"产出物料","component":"vxe-select","optionsSourceKey":"itemOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"全部物料"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["flow"]}]}},{"field":"resourceId","label":"资源","component":"vxe-select","optionsSourceKey":"resourceOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"全部资源"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["flow"]}]}},{"field":"operationId","label":"工序","component":"vxe-select","optionsSourceKey":"operationOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"全部工序"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["flow"]}]}}],"actions":[{"code":"submit","label":"查询","type":"submit","status":"primary","icon":"ri-search-line"},{"code":"reset","label":"重置","type":"reset","icon":"ri-refresh-line"}]},"materialVersion":"1.0.0"},{"id":"planning_routing_flow","kind":"planningFlow","sourceKey":"flow","height":650,"title":"工艺路线","description":"工序顺序、依赖关系、投入物料和占用资源。","fitViewOnInit":true,"materialVersion":"1.0.0"}]}'::jsonb, 1, timezone('utc'::text, now())
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
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
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
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_routing_view'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'planning_bom_view', '/dashboard/planning/bom-view', 'BOM',
  '查看产成品、工艺路线、工序和组件之间的递归结构。', 'custom', 'dashboard', 'published', true,
  '{"schemaVersion":1,"code":"planning_bom_view","route":"/dashboard/planning/bom-view","title":"BOM","pageType":"custom","description":"查看产成品、工艺路线、工序和组件之间的递归结构。","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"bom":{"key":"bom","label":"BOM 结构","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleData","postData":{"dataset":"bom","filters":{"itemId":"{{ forms.planning_bom_filter.itemId }}"}},"autoLoad":true},"itemOptions":{"key":"itemOptions","label":"产品与物料选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"item"},"autoLoad":true}},"eventHandlers":[{"event":"planningBom.nodeSelect","blockId":"planning_bom_tree","disabled":false,"directives":[{"type":"navigate","route":"/dashboard/planning/{{ row.entityType }}/edit?id={{ row.entityId }}&fromPage=planning_bom_view","disabled":false}]}],"blocks":[{"id":"planning_bom_filter","kind":"searchForm","title":"BOM 筛选","targetSourceKey":"bom","initialValues":{"itemId":""},"schema":{"columns":3,"fields":[{"field":"itemId","label":"产品/物料","component":"vxe-select","optionsSourceKey":"itemOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"全部产品与物料"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["bom"]}]}}],"actions":[{"code":"submit","label":"查询","type":"submit","status":"primary","icon":"ri-search-line"},{"code":"reset","label":"重置","type":"reset","icon":"ri-refresh-line"}]},"materialVersion":"1.0.0"},{"id":"planning_bom_tree","kind":"planningBom","sourceKey":"bom","height":650,"title":"BOM","description":"按产品、工艺路线、工序和组件递归展开。","keyField":"id","titleField":"title","childrenField":"children","materialVersion":"1.0.0"}]}'::jsonb, 1, timezone('utc'::text, now())
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
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
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
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_bom_view'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $$
begin
  if not exists (select 1 from public.admin_routes where code = 'planning-1') then
    raise exception 'The planning-1 Basic Data route is required for routing and BOM views.';
  end if;
end $$;

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
) values
(
    'planning-routing-view', '工艺路线', '/dashboard/planning/routing-view',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-route-line', 'planning_routing_view', 'planning.models.view',
    true, true, 'dashboard', 'active', 70,
    '{"module":"planning","group":"基础数据","pageKind":"structure-view"}'::jsonb
  ),
(
    'planning-bom-view', 'BOM', '/dashboard/planning/bom-view',
    (select id from public.admin_routes where code = 'planning-1'),
    'page', 'ri-node-tree', 'planning_bom_view', 'planning.models.view',
    true, true, 'dashboard', 'active', 80,
    '{"module":"planning","group":"基础数据","pageKind":"structure-view"}'::jsonb
  )
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
