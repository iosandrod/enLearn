-- Bind the ordered quantity validator to the low-code grid field metadata.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_tabs_block_index integer;
  v_tab_index integer;
  v_grid_block_index integer;
  v_grid jsonb;
  v_grid_config jsonb;
  v_columns jsonb;
  v_ordered_qty_column_count integer;
  v_edit_rules jsonb;
  v_validation_script text := $script$async function main(event) {
  const quantity = Number(event.value);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= 1000;
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

  v_next_schema := v_schema;

  select (entry.ordinality - 1)::integer
  into v_tabs_block_index
  from jsonb_array_elements(coalesce(v_next_schema -> 'blocks', '[]'::jsonb))
    with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-lines-tabs'
  limit 1;

  if v_tabs_block_index is null then
    raise exception 'Tabs block sales-order-lines-tabs does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_tab_index
  from jsonb_array_elements(
    coalesce(v_next_schema #> array['blocks', v_tabs_block_index::text, 'tabs'], '[]'::jsonb)
  ) with ordinality as entry(tab, ordinality)
  where entry.tab ->> 'key' = 'lines'
  limit 1;

  if v_tab_index is null then
    raise exception 'Sales-order detail tab lines does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_grid_block_index
  from jsonb_array_elements(
    coalesce(
      v_next_schema #> array[
        'blocks', v_tabs_block_index::text, 'tabs', v_tab_index::text, 'blocks'
      ],
      '[]'::jsonb
    )
  ) with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-lines-grid'
  limit 1;

  if v_grid_block_index is null then
    raise exception 'Grid sales-order-lines-grid does not exist.';
  end if;

  v_grid := v_next_schema #> array[
    'blocks', v_tabs_block_index::text,
    'tabs', v_tab_index::text,
    'blocks', v_grid_block_index::text
  ];
  v_grid_config := coalesce(v_grid #> '{schema,grid}', '{}'::jsonb);

  select count(*)::integer
  into v_ordered_qty_column_count
  from jsonb_array_elements(coalesce(v_grid_config -> 'columns', '[]'::jsonb)) as columns(column_value)
  where column_value ->> 'field' = 'ordered_qty';

  if v_ordered_qty_column_count <> 1 then
    raise exception 'Expected one ordered_qty column, found %.', v_ordered_qty_column_count;
  end if;

  select jsonb_agg(
    case
      when column_value ->> 'field' = 'ordered_qty' then
        column_value || jsonb_build_object(
          'editRender',
          coalesce(column_value -> 'editRender', '{}'::jsonb) || jsonb_build_object(
            'name', 'VxeNumberInput',
            'props',
            coalesce(column_value #> '{editRender,props}', '{}'::jsonb) ||
              jsonb_build_object('min', 0, 'max', 1000, 'digits', 6)
          ),
          'params',
          coalesce(column_value -> 'params', '{}'::jsonb) || jsonb_build_object(
            'lowcodeField',
            coalesce(column_value #> '{params,lowcodeField}', '{}'::jsonb) ||
              jsonb_build_object(
                'component', 'lc-number-input',
                'validationMessage', U&'\8BA2\8D2D\6570\91CF\5FC5\987B\5927\4E8E 0 \4E14\4E0D\80FD\5927\4E8E 1000',
                'validationScript', v_validation_script
              )
          )
        )
      else column_value
    end
    order by ordinality
  )
  into v_columns
  from jsonb_array_elements(coalesce(v_grid_config -> 'columns', '[]'::jsonb))
    with ordinality as columns(column_value, ordinality);

  v_edit_rules := coalesce(v_grid_config -> 'editRules', '{}'::jsonb);
  v_edit_rules := jsonb_set(
    v_edit_rules,
    '{ordered_qty}',
    jsonb_build_array(
      jsonb_build_object(
        'required', true,
        'message', U&'\8BF7\8F93\5165\8BA2\8D2D\6570\91CF'
      ),
      jsonb_build_object(
        'type', 'number',
        'max', 1000,
        'message', U&'\8BA2\8D2D\6570\91CF\4E0D\80FD\5927\4E8E 1000'
      )
    ),
    true
  );

  v_grid_config := v_grid_config || jsonb_build_object(
    'columns', coalesce(v_columns, '[]'::jsonb),
    'editRules', v_edit_rules
  );
  v_grid := jsonb_set(v_grid, '{schema,grid}', v_grid_config, false);
  v_next_schema := jsonb_set(
    v_next_schema,
    array[
      'blocks', v_tabs_block_index::text,
      'tabs', v_tab_index::text,
      'blocks', v_grid_block_index::text
    ],
    v_grid,
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
