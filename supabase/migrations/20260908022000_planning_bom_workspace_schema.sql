begin;

do $planning_bom_schema_v2$
declare
  v_schema jsonb := $planning_bom_json_v2$
{"schemaVersion":1,"code":"planning_bom_view","route":"/dashboard/planning/bom-view","title":"BOM","pageType":"custom","description":"查看产成品、工艺路线、工序和组件之间的递归结构。","layout":"dashboard","status":"published","keepAlive":true,"dataSources":{"bom":{"key":"bom","label":"BOM 结构","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleData","postData":{"dataset":"bom","filters":{"itemId":"{{ forms.planning_bom_filter.itemId }}"}},"autoLoad":true},"bomFlow":{"key":"bomFlow","label":"选中物料工艺路线图","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleData","postData":{"dataset":"flow","filters":{"operationId":"__none__"},"requiredFilters":["operationId"]},"autoLoad":false},"itemOptions":{"key":"itemOptions","label":"产品与物料选项","sourceType":"custom","serviceName":"planning","serviceMethod":"getPlanningConsoleOptions","postData":{"optionType":"item"},"autoLoad":true}},"eventHandlers":[{"event":"planningBom.nodeSelect","blockId":"planning_bom_tree","directives":[{"type":"navigate","route":"/dashboard/planning/{{ row.entityType }}/edit?id={{ row.entityId }}&fromPage=planning_bom_view"}]},{"event":"planningBom.routeSelect","blockId":"planning_bom_tree","directives":[{"type":"setSearchFilters","sourceKey":"bomFlow","mode":"replace","values":{"operationId":"{{ event.route.id }}"}}]},{"event":"planningBom.createRoute","blockId":"planning_bom_tree","directives":[{"type":"navigate","route":"/dashboard/planning/operation/edit?prefill=%7B%22item_id%22%3A%22{{ event.materialId }}%22%2C%22type%22%3A%22routing%22%7D&fromPage=planning_bom_view"}]}],"blocks":[{"id":"planning_bom_filter","kind":"searchForm","title":"BOM 筛选","targetSourceKey":"bom","initialValues":{"itemId":""},"schema":{"columns":3,"fields":[{"field":"itemId","label":"产品/物料","component":"vxe-select","optionsSourceKey":"itemOptions","optionProps":{"label":"label","value":"id"},"props":{"clearable":true,"filterable":true,"placeholder":"全部产品与物料"},"events":{"change":[{"type":"refreshDataSources","sourceKeys":["bom"]}]}}],"actions":[{"code":"submit","label":"查询","type":"submit","status":"primary","icon":"ri-search-line"},{"code":"reset","label":"重置","type":"reset","icon":"ri-refresh-line"}]}},{"id":"planning_bom_workspace","kind":"container","columns":2,"columnSpans":[1,1],"gap":12,"blocks":[{"id":"planning_bom_tree","kind":"planningBom","sourceKey":"bom","height":650,"title":"BOM","description":"按产品、工艺路线、工序和组件递归展开。","keyField":"id","titleField":"title","childrenField":"children","routeActionDirectives":[]},{"id":"planning_bom_flow","kind":"planningFlow","sourceKey":"bomFlow","height":650,"title":"产出工艺路线","description":"选择物料操作中的路线后，在此查看工序模型。","fitViewOnInit":true}]}]}
$planning_bom_json_v2$::jsonb;
  v_page_id uuid;
  v_version integer;
begin
  update public.lowcode_pages
  set schema = v_schema,
      version = case when schema is distinct from v_schema then version + 1 else version end,
      published_at = case when schema is distinct from v_schema then timezone('utc'::text, now()) else published_at end,
      updated_at = case when schema is distinct from v_schema then timezone('utc'::text, now()) else updated_at end
  where code = 'planning_bom_view'
  returning id, version into v_page_id, v_version;

  if not found then
    raise exception 'Low-code page planning_bom_view does not exist.';
  end if;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select v_page_id, v_version, v_schema, timezone('utc'::text, now())
  where not exists (
    select 1 from public.lowcode_page_versions
    where page_id = v_page_id and version = v_version and schema = v_schema
  );
end
$planning_bom_schema_v2$;

select pg_notify('pgrst', 'reload schema');
commit;

