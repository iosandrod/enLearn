-- Store the planning route designer as a database-driven low-code page.

begin;

-- Older navigation provisioning could create this route with a hyphenated page code.
-- Normalize that record first so the route unique constraint does not block the canonical page.
update public.admin_routes
set page_code = null
where path = '/dashboard/planning/route-designer'
  and page_code <> 'planning_route_designer';

update public.lowcode_pages
set code = 'planning_route_designer'
where route = '/dashboard/planning/route-designer'
  and code <> 'planning_route_designer';

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'planning_route_designer', '/dashboard/planning/route-designer', '工艺路线设计',
  '查看工艺路线，并在选中工序后查看其物料、资源、子工序和前置依赖。', 'custom', 'dashboard', 'published', true,
  '{"schemaVersion":1,"code":"planning_route_designer","route":"/dashboard/planning/route-designer","title":"工艺路线设计","pageType":"custom","description":"查看工艺路线，并在选中工序后查看其物料、资源、子工序和前置依赖。","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"flow":{"key":"flow","label":"工艺路线图","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleData","postData":{"dataset":"flow","filters":{"operationId":"{{ forms.planning_route_designer_filter.operationId }}"},"requiredFilters":["operationId"]},"autoLoad":false},"routingSuboperations":{"key":"routingSuboperations","label":"路线工序","sourceType":"custom","serviceName":"planning","serviceMethod":"listItems","postData":{"resource":"planning_suboperation","tableName":"planning_suboperation","filters":{"operation_id":"__none__"},"requiredFilters":["operation_id"],"limit":1000},"autoLoad":false},"routingMaterials":{"key":"routingMaterials","label":"关联物料","sourceType":"custom","serviceName":"planning","serviceMethod":"listItems","postData":{"resource":"planning_operationmaterial","tableName":"planning_operationmaterial","filters":{"operation_id":"__none__"},"requiredFilters":["operation_id"],"limit":1000},"autoLoad":false},"routingResources":{"key":"routingResources","label":"关联资源","sourceType":"custom","serviceName":"planning","serviceMethod":"listItems","postData":{"resource":"planning_operationresource","tableName":"planning_operationresource","filters":{"operation_id":"__none__"},"requiredFilters":["operation_id"],"limit":1000},"autoLoad":false},"routingDependencies":{"key":"routingDependencies","label":"工序依赖","sourceType":"custom","serviceName":"planning","serviceMethod":"listItems","postData":{"resource":"planning_operation_dependency","tableName":"planning_operation_dependency","filters":{"operation_id":"__none__"},"requiredFilters":["operation_id"],"limit":1000},"autoLoad":false},"routeOptions":{"key":"routeOptions","label":"工艺路线选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"route"},"autoLoad":true}},"eventHandlers":[{"event":"planningFlow.nodeSelect","blockId":"planning_route_designer_flow","disabled":false,"directives":[{"type":"setSearchFilters","sourceKey":"routingSuboperations","mode":"replace","values":{"operation_id":"{{ event.row.id }}"},"disabled":false},{"type":"setSearchFilters","sourceKey":"routingMaterials","mode":"replace","values":{"operation_id":"{{ event.row.id }}"},"disabled":false},{"type":"setSearchFilters","sourceKey":"routingResources","mode":"replace","values":{"operation_id":"{{ event.row.id }}"},"disabled":false},{"type":"setSearchFilters","sourceKey":"routingDependencies","mode":"replace","values":{"operation_id":"{{ event.row.id }}"},"disabled":false}]}],"blocks":[{"id":"planning_route_designer_filter","kind":"searchForm","title":"工艺路线查询","targetSourceKey":"flow","initialValues":{"operationId":""},"schema":{"columns":1,"fields":[{"field":"operationId","label":"工艺路线","component":"vxe-select","optionsSourceKey":"routeOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"请选择工艺路线"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["flow"]}]}}],"actions":[{"code":"submit","label":"查询","type":"submit","status":"primary","icon":"ri-search-line"},{"code":"reset","label":"重置","type":"reset","icon":"ri-refresh-line"}]},"materialVersion":"1.0.0"},{"id":"planning_route_designer_flow","kind":"planningFlow","sourceKey":"flow","height":560,"title":"工艺路线","description":"选择工序后，关联信息将在下方子表中更新。","fitViewOnInit":true,"materialVersion":"1.0.0"},{"id":"planning_route_designer_detail_tabs","kind":"tabs","title":"关联信息","defaultKey":"suboperations","tabs":[{"key":"suboperations","label":"路线工序","blocks":[{"id":"planning_routing_suboperations_grid","kind":"grid","tableType":"detail","sourceKey":"routingSuboperations","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":270,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"suboperation_id_label","title":"工序","minWidth":220,"fixed":"left","formatter":{"type":"text","emptyText":"-"}},{"field":"operation_id_label","title":"所属路线","minWidth":200,"formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"顺序/优先级","width":120,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"effective_start","title":"生效开始","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false}},"materialVersion":"1.0.0"}]},{"key":"materials","label":"关联物料","blocks":[{"id":"planning_routing_materials_grid","kind":"grid","tableType":"detail","sourceKey":"routingMaterials","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":270,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"item_id_label","title":"物料","minWidth":220,"fixed":"left","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":160,"formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"名称","minWidth":160,"formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"流动时点","width":112,"align":"center","formatter":{"type":"enum","map":{"start":"开始","end":"结束","transfer_batch":"分批转移"},"emptyText":"-"}},{"field":"quantity","title":"变动用量","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"quantity_fixed","title":"固定用量","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"transferbatch","title":"转移批量","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"priority","title":"优先级","width":90,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"effective_start","title":"生效开始","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false}},"materialVersion":"1.0.0"}]},{"key":"resources","label":"关联资源","blocks":[{"id":"planning_routing_resources_grid","kind":"grid","tableType":"detail","sourceKey":"routingResources","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":270,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":220,"fixed":"left","formatter":{"type":"text","emptyText":"-"}},{"field":"skill_id_label","title":"技能","minWidth":180,"formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"名称","minWidth":160,"formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"变动用量","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"quantity_fixed","title":"固定用量","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"setup","title":"换型","minWidth":130,"formatter":{"type":"text","emptyText":"-"}},{"field":"priority","title":"优先级","width":90,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"effective_start","title":"生效开始","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"effective_end","title":"生效结束","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false}},"materialVersion":"1.0.0"}]},{"key":"dependencies","label":"工序依赖","blocks":[{"id":"planning_routing_dependencies_grid","kind":"grid","tableType":"detail","sourceKey":"routingDependencies","schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":270,"rowConfig":{"keyField":"id","isCurrent":true},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":64,"align":"center"},{"field":"blockedby_id_label","title":"前置工序","minWidth":240,"fixed":"left","formatter":{"type":"text","emptyText":"-"}},{"field":"operation_id_label","title":"当前工序","minWidth":220,"formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量比例","width":110,"align":"right","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"}},{"field":"safety_leadtime","title":"安全提前期","width":140,"formatter":{"type":"text","emptyText":"-"}},{"field":"hard_safety_leadtime","title":"硬安全提前期","width":150,"formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false}},"materialVersion":"1.0.0"}]}],"materialVersion":"1.0.0"}]}'::jsonb, 1, timezone('utc'::text, now())
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
      or public.lowcode_pages.page_type is distinct from excluded.page_type
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
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then excluded.published_at
    else public.lowcode_pages.published_at
  end,
  updated_at = case
    when public.lowcode_pages.schema is distinct from excluded.schema
      or public.lowcode_pages.route is distinct from excluded.route
      or public.lowcode_pages.title is distinct from excluded.title
      or public.lowcode_pages.description is distinct from excluded.description
      or public.lowcode_pages.page_type is distinct from excluded.page_type
      or public.lowcode_pages.status is distinct from excluded.status
      or public.lowcode_pages.keep_alive is distinct from excluded.keep_alive
    then timezone('utc'::text, now())
    else public.lowcode_pages.updated_at
  end;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_route_designer'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'planning-route-designer', '工艺路线设计', '/dashboard/planning/route-designer',
  parent.id, 'page', 'ri-share-forward-2-line', 'planning_route_designer',
  'planning.models.view', true, true, 'dashboard', 'active', 65,
  '{"group":"advanced","category":"planning","module":"planning","pageKind":"route-designer"}'::jsonb
from public.admin_routes parent
where parent.code = 'advanced-root'
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

do $$
begin
  if not exists (
    select 1
    from public.lowcode_pages page
    where page.code = 'planning_route_designer'
      and page.route = '/dashboard/planning/route-designer'
      and page.page_type = 'custom'
      and page.status = 'published'
      and jsonb_array_length(page.schema->'blocks') = 3
  ) then
    raise exception 'The planning route designer low-code page could not be installed.';
  end if;

  if not exists (
    select 1
    from public.lowcode_page_versions version
    join public.lowcode_pages page on page.id = version.page_id
    where page.code = 'planning_route_designer'
      and version.version = page.version
      and version.schema = page.schema
  ) then
    raise exception 'The planning route designer low-code page version could not be installed.';
  end if;

  if not exists (
    select 1
    from public.admin_routes route
    join public.admin_routes parent on parent.id = route.parent_id
    where route.code = 'planning-route-designer'
      and route.path = '/dashboard/planning/route-designer'
      and route.page_code = 'planning_route_designer'
      and route.status = 'active'
      and parent.code = 'advanced-root'
  ) then
    raise exception 'The planning route designer navigation route could not be bound to its page.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
