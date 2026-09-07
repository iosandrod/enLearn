-- Add the route creation entry point to the database-driven route designer.
-- The operation edit page owns validation and persistence; the route designer
-- opens it as a confirm dialog and refreshes its route options after saving.
begin;

do $migration$
declare
  v_page_id uuid;
  v_schema jsonb;
  v_version integer;
  v_new_route_function jsonb := jsonb_build_object(
    'name', 'newRoute',
    'label', '新建路线',
    'description', '在工序编辑页弹框中新建并保存一条工艺路线。',
    'enabled', true,
    'script', E'const result = await this.$dialog.confirmLowCodePage({\n  pageCode: "planning_operation-edit",\n  title: "新建路线",\n  confirmLabel: "保存路线",\n  cancelLabel: "取消",\n  submitOnConfirm: true,\n  requireSelection: false,\n  includeEventHistory: false,\n  dialog: { id: "planning-route-designer-new-route-dialog" }\n});\nif (!result || result.action !== "confirm") return null;\nawait this.executeAction({\n  node: "planning_route_designer_filter",\n  method: "refreshOptions",\n  sourceKeys: ["routeOptions"]\n});\nawait this.$message.success("工艺路线已保存。");\nreturn result;'
  );
  v_actions_block jsonb := jsonb_build_object(
    'id', 'planning_route_designer_actions',
    'kind', 'buttonGroup',
    'align', 'left',
    'gap', 8,
    'actions', jsonb_build_array(jsonb_build_object(
      'code', 'planning-route-designer-new-route',
      'label', '新建路线',
      'type', 'button',
      'mode', 'button',
      'status', 'primary',
      'icon', 'ri-add-line',
      'permissionCode', 'planning.models.manage',
      'script', 'return this.executeFunction({ name: "newRoute", args: {} });'
    ))
  );
begin
  select id, schema, version
    into v_page_id, v_schema, v_version
  from public.lowcode_pages
  where code = 'planning_route_designer'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page planning_route_designer does not exist.';
  end if;

  v_schema := jsonb_set(
    v_schema,
    '{functions}',
    coalesce((
      select jsonb_agg(page_function)
      from jsonb_array_elements(coalesce(v_schema->'functions', '[]'::jsonb)) page_function
      where page_function->>'name' <> 'newRoute'
    ), '[]'::jsonb) || jsonb_build_array(v_new_route_function),
    true
  );

  v_schema := jsonb_set(
    v_schema,
    '{scriptPolicy}',
    coalesce(v_schema->'scriptPolicy', '{}'::jsonb) || jsonb_build_object(
      'capabilities', jsonb_build_array(
        'action.execute',
        'dialog.confirmLowCodePage',
        'message.success',
        'pageFunction.execute'
      )
    ),
    true
  );

  v_schema := jsonb_set(
    v_schema,
    '{blocks}',
    jsonb_build_array(v_actions_block) || coalesce((
      select jsonb_agg(block order by block_index)
      from jsonb_array_elements(coalesce(v_schema->'blocks', '[]'::jsonb))
        with ordinality as blocks(block, block_index)
      where block->>'id' <> 'planning_route_designer_actions'
    ), '[]'::jsonb),
    true
  );

  update public.lowcode_pages
  set
    schema = v_schema,
    version = v_version + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_version + 1, v_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end
$migration$;

select pg_notify('pgrst', 'reload schema');
commit;
