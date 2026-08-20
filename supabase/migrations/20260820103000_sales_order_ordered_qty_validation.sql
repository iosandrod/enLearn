-- Keep sales-order quantities within the agreed business range before saving.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_actions jsonb;
  v_block_index integer;
  v_action_index integer;
  v_save_script text;
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
  from jsonb_array_elements(v_actions) with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'save'
  limit 1;

  if v_action_index is null then
    raise exception 'Sales-order save action does not exist.';
  end if;

  v_save_script := v_actions -> v_action_index ->> 'script';
  if coalesce(v_save_script, '') = '' then
    raise exception 'Sales-order save action script does not exist.';
  end if;

  if position('const validateOrderedQuantities = (details) =>' in v_save_script) = 0 then
    v_save_script := replace(
      v_save_script,
      '  const currentId = String(form.id || this.route.query.id || "").trim();',
      $validation$  const validateOrderedQuantities = (details) => {
    for (const [index, detail] of details.entries()) {
      const quantity = Number(detail.ordered_qty);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
        return index + 1;
      }
    }
    return 0;
  };

  const currentId = String(form.id || this.route.query.id || "").trim();$validation$
    );

    if position('  data.__details = [currentId' in v_save_script) = 0 then
      raise exception 'Sales-order save action script format is unsupported.';
    end if;

    v_save_script := replace(
      v_save_script,
      '  data.__details = [currentId',
      $validation$  const quantityRows = currentId
    ? [...created, ...updated]
    : created;
  const invalidQuantityRow = validateOrderedQuantities(quantityRows);
  if (invalidQuantityRow) {
    await this.$message.warning(`第 ${invalidQuantityRow} 条明细的订购数量必须大于 0 且不能大于 1000`);
    return false;
  }

  data.__details = [currentId$validation$
    );
  end if;

  v_actions := jsonb_set(
    v_actions,
    array[v_action_index::text],
    (v_actions -> v_action_index) || jsonb_build_object('script', v_save_script),
    false
  );
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
