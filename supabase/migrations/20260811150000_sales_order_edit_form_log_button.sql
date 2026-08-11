-- Keep the sales-order edit diagnostic button reproducible and executable.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_actions jsonb;
  v_block_index integer;
  v_action_index integer;
  v_script text := $script$async function main() {
  const formData = await this.executeAction({
    node: "sales-order-edit-form",
    method: "getData",
  });

  console.log("销售订单编辑表单数据", formData);
  return formData;
}$script$;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_block_index
  from jsonb_array_elements(coalesce(v_schema -> 'blocks', '[]'::jsonb))
    with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-edit-actions'
  limit 1;

  if v_block_index is null then
    raise exception 'Button group sales-order-edit-actions does not exist.';
  end if;

  v_actions := coalesce(
    v_schema #> array['blocks', v_block_index::text, 'actions'],
    '[]'::jsonb
  );

  select (entry.ordinality - 1)::integer
  into v_action_index
  from jsonb_array_elements(v_actions)
    with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'getEditFormRow'
  limit 1;

  if v_action_index is null then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'code', 'getEditFormRow',
      'type', 'button',
      'mode', 'button',
      'label', '获取编辑表单数据',
      'disabled', false,
      'script', v_script
    ));
  else
    v_actions := jsonb_set(
      v_actions,
      array[v_action_index::text],
      (v_actions -> v_action_index) || jsonb_build_object(
        'label', '获取编辑表单数据',
        'script', v_script
      ),
      false
    );
  end if;

  v_next_schema := jsonb_set(
    v_schema,
    array['blocks', v_block_index::text, 'actions'],
    v_actions,
    false
  );

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = v_version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = v_page_id
    returning version into v_version;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    select id, version, schema, published_at
    from public.lowcode_pages
    where id = v_page_id
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
