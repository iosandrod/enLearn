-- Make the route-designer BOM action use the same modal editor as the toolbar
-- action, while carrying the clicked material into the editor as prefill data.

begin;

with page_update as (
  select
    page.id,
    (
      page.schema || jsonb_build_object(
        'functions', coalesce(
          (
            select jsonb_agg(
              case
                when fn->>'name' = 'newRoute' then jsonb_set(
                  fn,
                  '{script}',
                  to_jsonb($script$
const materialId = String(this.event?.args?.materialId || "").trim();
const currentRoute = this.route || {};
const currentQuery = currentRoute.query && typeof currentRoute.query === "object" ? currentRoute.query : {};
const dialogRoute = materialId
  ? { ...currentRoute, query: { ...currentQuery, prefill: encodeURIComponent(JSON.stringify({ item_id: materialId, type: "routing" })) } }
  : currentRoute;
const result = await this.$dialog.confirmLowCodePage({
  pageCode: "planning_operation-edit",
  title: "新建路线",
  confirmLabel: "保存路线",
  cancelLabel: "取消",
  submitOnConfirm: true,
  requireSelection: false,
  includeEventHistory: false,
  route: dialogRoute,
  dialog: { id: "planning-route-designer-new-route-dialog" }
});
if (!result || result.action !== "confirm") return null;
await this.executeAction({
  node: "planning_route_designer_filter",
  method: "refreshOptions",
  sourceKeys: ["routeOptions"]
});
await this.$message.success("工艺路线已保存。");
return result;
$script$::text),
                  true
                )
                else fn
              end
            )
            from jsonb_array_elements(coalesce(page.schema->'functions', '[]'::jsonb)) fn
          ),
          '[]'::jsonb
        )
      )
    ) as schema
  from public.lowcode_pages page
  where page.code = 'planning_route_designer'
), changed as (
  update public.lowcode_pages page
  set schema = update.schema,
      version = page.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  from page_update update
  where page.id = update.id
    and page.schema is distinct from update.schema
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from changed
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $$
begin
  if not exists (
    select 1
    from public.lowcode_pages page
    where page.code = 'planning_route_designer'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(page.schema->'functions', '[]'::jsonb)) fn
        where fn->>'name' = 'newRoute'
          and fn->>'script' like '%materialId%'
          and fn->>'script' like '%prefill%'
          and fn->>'script' like '%confirmLowCodePage%'
      )
  ) then
    raise exception 'The route-designer new-route prefill function could not be installed.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
