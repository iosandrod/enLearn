-- Add the database-owned BOM route picker function to the route designer.
begin;

with function_definition as (
  select jsonb_build_object(
    'name', 'viewBomRoutes',
    'label', '查看工艺路线',
    'description', '弹出当前物料可用的工艺路线列表，并将选中的路线显示在右侧模型图。',
    'enabled', true,
    'script', $view_routes$
const materialId = String(this.event?.args?.materialId || "").trim();
if (!materialId) return null;
const currentRow = this.event?.args?.row || this.event?.row || {};
const currentRoute = this.route || {};
const currentQuery = currentRoute.query && typeof currentRoute.query === "object" ? currentRoute.query : {};
const dialogRoute = { ...currentRoute, query: { ...currentQuery, itemId: materialId } };
const result = await this.$dialog.confirmLowCodePage({
  pageCode: "planning_bom_route_picker",
  title: "选择工艺路线",
  confirmLabel: "查看路线",
  cancelLabel: "取消",
  requireSelection: true,
  selectOn: ["rowCurrentChange", "rowDblclick"],
  route: dialogRoute,
  dialog: { id: "planning-route-designer-bom-route-picker-dialog" }
});
if (!result || result.action !== "confirm" || !result.row?.id) return null;
await this.$events.emit("planningBom.routeSelect", {
  route: result.row,
  materialId,
  row: currentRow
});
return result;
$view_routes$::text
  ) as definition
), updated as (
  update public.lowcode_pages page
  set schema = jsonb_set(
    jsonb_set(
      page.schema,
      '{functions}',
      (
        select
          case
            when exists (
              select 1
              from jsonb_array_elements(coalesce(page.schema->'functions', '[]'::jsonb)) fn
              where fn->>'name' = 'viewBomRoutes'
            )
            then coalesce(page.schema->'functions', '[]'::jsonb)
            else coalesce(page.schema->'functions', '[]'::jsonb) || (select definition from function_definition)
          end
      ),
      true
    ),
    '{scriptPolicy,capabilities}',
    (
      select jsonb_agg(cap order by ord)
      from (
        select cap, min(ord) as ord
        from (
          select cap, ord
          from jsonb_array_elements_text(
            coalesce(page.schema #> '{scriptPolicy,capabilities}', '[]'::jsonb)
          ) with ordinality as existing(cap, ord)
          union all
          select 'event.emit', 1000000
        ) values_list
        group by cap
      ) deduplicated
    ),
    true
  ),
  version = page.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
  from function_definition
  where page.code = 'planning_route_designer'
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from updated
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
commit;

