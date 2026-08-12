-- Select sales-order materials from planning item master data and map the
-- selected record back to the editable detail row.

begin;

do $migration$
declare
  page_record record;
  next_schema jsonb;
  columns_path text[];
  item_column jsonb;
begin
  for page_record in
    select id, schema
    from public.lowcode_pages
    where code = 'sales-orders-edit'
    for update
  loop
    select array[
      'blocks', (root_ordinal - 1)::text,
      'tabs', (tab_ordinal - 1)::text,
      'blocks', (grid_ordinal - 1)::text,
      'schema', 'grid', 'columns'
    ]
    into columns_path
    from jsonb_array_elements(coalesce(page_record.schema->'blocks', '[]'::jsonb))
      with ordinality root_blocks(root_block, root_ordinal)
    cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb))
      with ordinality tabs(tab_item, tab_ordinal)
    cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
      with ordinality grid_blocks(grid_block, grid_ordinal)
    where grid_block->>'id' = 'sales-order-lines-grid'
    limit 1;

    if columns_path is null then
      raise exception 'Grid sales-order-lines-grid was not found.';
    end if;

    select column_item
    into item_column
    from jsonb_array_elements(page_record.schema #> columns_path) column_item
    where column_item->>'field' = 'item_code'
    limit 1;

    if item_column is null then
      raise exception 'Column sales_order_lines.item_code was not found.';
    end if;

    item_column := item_column || jsonb_build_object(
      'editRender', jsonb_build_object(
        'name', 'VxeInput',
        'props', jsonb_build_object('clearable', true)
      ),
      'params', coalesce(item_column->'params', '{}'::jsonb) || jsonb_build_object(
        'lowcodeField', jsonb_build_object(
          'component', 'base-info',
          'props', jsonb_build_object(
            'relateInfoConfig', jsonb_build_object(
              'sourceType', 'entity',
              'entityCode', 'planning_item',
              'tableName', 'planning_item',
              'resource', 'planning_item',
              'serviceName', 'planning',
              'serviceMethod', 'listItems',
              'valueField', 'name',
              'displayField', 'name',
              'displayValueField', 'item_code',
              'searchFields', jsonb_build_array('name', 'display_name'),
              'searchable', true,
              'searchPlaceholder', U&'\8BF7\8F93\5165\7269\6599\7F16\7801\6216\540D\79F0',
              'pageSize', 100,
              'popupWidth', 960,
              'popupHeight', 360,
              'fieldMappings', jsonb_build_array(
                jsonb_build_object('sourceField', 'id', 'targetField', 'item_id'),
                jsonb_build_object('sourceField', 'name', 'targetField', 'item_code'),
                jsonb_build_object('sourceField', 'display_name', 'targetField', 'item_name'),
                jsonb_build_object('sourceField', 'description', 'targetField', 'item_spec'),
                jsonb_build_object('sourceField', 'category', 'targetField', 'item_category_name'),
                jsonb_build_object('sourceField', 'uom', 'targetField', 'uom_name'),
                jsonb_build_object('sourceField', 'uom', 'targetField', 'pricing_uom_name')
              ),
              'columns', jsonb_build_array(
                jsonb_build_object('field', 'name', 'title', U&'\7269\6599\7F16\7801', 'minWidth', 180),
                jsonb_build_object('field', 'display_name', 'title', U&'\7269\6599\540D\79F0', 'minWidth', 220),
                jsonb_build_object('field', 'description', 'title', U&'\89C4\683C\8BF4\660E', 'minWidth', 260),
                jsonb_build_object('field', 'category', 'title', U&'\7C7B\522B', 'minWidth', 120),
                jsonb_build_object('field', 'uom', 'title', U&'\5355\4F4D', 'minWidth', 90)
              )
            )
          )
        )
      )
    );

    next_schema := jsonb_set(
      page_record.schema,
      columns_path,
      (
        select jsonb_agg(
          case when column_item->>'field' = 'item_code' then item_column else column_item end
          order by ordinal
        )
        from jsonb_array_elements(page_record.schema #> columns_path)
          with ordinality columns(column_item, ordinal)
      ),
      false
    );

    if next_schema is distinct from page_record.schema then
      update public.lowcode_pages
      set schema = next_schema,
          version = version + 1,
          published_at = case
            when status = 'published' then timezone('utc'::text, now())
            else published_at
          end,
          updated_at = timezone('utc'::text, now())
      where id = page_record.id;

      insert into public.lowcode_page_versions (page_id, version, schema, published_at)
      select id, version, schema, published_at
      from public.lowcode_pages
      where id = page_record.id
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end loop;
end
$migration$;

do $validation$
declare
  item_column jsonb;
begin
  select column_item
  into item_column
  from public.lowcode_pages pages
  cross join lateral jsonb_array_elements(coalesce(pages.schema->'blocks', '[]'::jsonb)) root_block
  cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb)) tab_item
  cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb)) grid_block
  cross join lateral jsonb_array_elements(coalesce(grid_block#>'{schema,grid,columns}', '[]'::jsonb)) column_item
  where pages.code = 'sales-orders-edit'
    and grid_block->>'id' = 'sales-order-lines-grid'
    and column_item->>'field' = 'item_code'
  order by pages.updated_at desc
  limit 1;

  if coalesce(item_column#>>'{params,lowcodeField,component}', '') <> 'base-info'
    or coalesce(item_column#>>'{params,lowcodeField,props,relateInfoConfig,resource}', '') <> 'planning_item'
    or coalesce(item_column#>>'{params,lowcodeField,props,relateInfoConfig,valueField}', '') <> 'name'
    or not exists (
      select 1
      from jsonb_array_elements(coalesce(
        item_column#>'{params,lowcodeField,props,relateInfoConfig,fieldMappings}',
        '[]'::jsonb
      )) mapping
      where mapping->>'sourceField' = 'display_name'
        and mapping->>'targetField' = 'item_name'
    )
  then
    raise exception 'Sales-order material base-info validation failed: %.', item_column;
  end if;
end
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
