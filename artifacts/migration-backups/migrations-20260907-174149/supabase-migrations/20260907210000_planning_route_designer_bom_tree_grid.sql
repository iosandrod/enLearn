-- Configure the route designer's left pane as a BOM tree table.
-- The existing material selector drives the BOM request through declarative page events.

begin;

do $$
declare
  page_schema jsonb;
  next_schema jsonb;
  runtime_root_index integer;
  runtime_left_index integer;
  runtime_left_path text[];
  runtime_left_blocks jsonb;
  visual_root_index integer;
  visual_slot_key text;
  visual_left_path text[];
  visual_left_blocks jsonb;
  next_version integer;
begin
  select schema
  into page_schema
  from public.lowcode_pages
  where code = 'planning_route_designer'
  for update;

  if page_schema is null then
    raise exception 'Low-code page planning_route_designer does not exist.';
  end if;

  select root_entry.ordinality::integer - 1
  into runtime_root_index
  from jsonb_array_elements(coalesce(page_schema->'blocks', '[]'::jsonb))
    with ordinality as root_entry(block, ordinality)
  where root_entry.block->>'kind' = 'container'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(root_entry.block->'blocks', '[]'::jsonb)) as child_container(block)
      where exists (
        select 1
        from jsonb_array_elements(coalesce(child_container.block->'blocks', '[]'::jsonb)) as child_block(block)
        where child_block.block->>'id' = 'records-grid'
      )
    )
  limit 1;

  if runtime_root_index is null then
    raise exception 'The route designer runtime container could not be located.';
  end if;

  select child_entry.ordinality::integer - 1
  into runtime_left_index
  from jsonb_array_elements(
    coalesce(page_schema #> array['blocks', runtime_root_index::text, 'blocks'], '[]'::jsonb)
  ) with ordinality as child_entry(block, ordinality)
  where exists (
    select 1
    from jsonb_array_elements(coalesce(child_entry.block->'blocks', '[]'::jsonb)) as child_block(block)
    where child_block.block->>'id' = 'records-grid'
  )
  limit 1;

  if runtime_left_index is null then
    raise exception 'The route designer left runtime column could not be located.';
  end if;

  runtime_left_path := array[
    'blocks', runtime_root_index::text, 'blocks', runtime_left_index::text, 'blocks'
  ];

  select jsonb_agg(
    case
      when entry.block->>'id' = 'records-grid' then
        (
          entry.block
          - 'tableName'
          - 'viewName'
          - 'entityCode'
        ) || jsonb_build_object(
          'title', 'BOM 结构',
          'sourceKey', 'records-grid',
          'sourceType', 'custom',
          'schema', jsonb_set(
            jsonb_set(
              coalesce(entry.block->'schema', '{}'::jsonb),
              '{title}',
              to_jsonb('BOM 结构'::text),
              true
            ),
            '{grid}',
            (
              coalesce(entry.block#>'{schema,grid}', '{}'::jsonb)
              - 'columns'
              - 'stripe'
              - 'treeConfig'
            ) || jsonb_build_object(
              'stripe', false,
              'columns', jsonb_build_array(
                jsonb_build_object(
                  'field', 'title',
                  'title', 'BOM 节点',
                  'minWidth', 220,
                  'treeNode', true,
                  'showOverflow', 'tooltip'
                ),
                jsonb_build_object(
                  'field', 'quantity',
                  'title', '用量',
                  'width', 88,
                  'align', 'right',
                  'formatter', jsonb_build_object(
                    'type', 'number',
                    'locale', 'zh-CN',
                    'emptyText', '-'
                  )
                ),
                jsonb_build_object(
                  'field', 'uom',
                  'title', '单位',
                  'width', 72,
                  'showOverflow', 'tooltip'
                )
              ),
              'rowConfig', jsonb_build_object(
                'keyField', 'id',
                'useKey', true,
                'isCurrent', true,
                'isHover', true
              ),
              'treeConfig', jsonb_build_object(
                'childrenField', 'children',
                'expandAll', true
              )
            ),
            true
          )
        )
      else entry.block
    end
    order by entry.ordinality
  )
  into runtime_left_blocks
  from jsonb_array_elements(coalesce(page_schema #> runtime_left_path, '[]'::jsonb))
    with ordinality as entry(block, ordinality);

  if runtime_left_blocks is null then
    raise exception 'The route designer left runtime blocks could not be updated.';
  end if;

  next_schema := jsonb_set(page_schema, runtime_left_path, runtime_left_blocks, false);

  next_schema := jsonb_set(
    next_schema,
    '{dataSources,records-grid}',
    jsonb_build_object(
      'key', 'records-grid',
      'label', 'BOM 结构',
      'sourceType', 'custom',
      'serviceName', 'planning',
      'serviceMethod', 'getPlanningConsoleData',
      'postData', jsonb_build_object(
        'dataset', 'bom',
        'filters', jsonb_build_object(
          'itemId', '{{ forms.edit-form.name }}'
        )
      ),
      'autoLoad', true
    ),
    true
  );

  next_schema := jsonb_set(
    next_schema,
    '{eventHandlers}',
    coalesce((
      select jsonb_agg(handler order by ordinality)
      from jsonb_array_elements(coalesce(next_schema->'eventHandlers', '[]'::jsonb))
        with ordinality as existing(handler, ordinality)
      where not (
        handler->>'event' = 'form.fieldChange'
        and handler->>'blockId' = 'edit-form'
      )
    ), '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'event', 'form.fieldChange',
        'blockId', 'edit-form',
        'disabled', false,
        'directives', jsonb_build_array(
          jsonb_build_object(
            'type', 'refreshDataSources',
            'sourceKeys', jsonb_build_array('records-grid'),
            'disabled', false
          )
        )
      )
    ),
    true
  );

  select visual_entry.ordinality::integer - 1
  into visual_root_index
  from jsonb_array_elements(
    coalesce(next_schema #> array['visualEditor', 'pages', '/', 'blocks'], '[]'::jsonb)
  ) with ordinality as visual_entry(block, ordinality)
  where visual_entry.block->>'componentKey' = 'layout'
    and exists (
      select 1
      from jsonb_each(coalesce(visual_entry.block#>'{props,slots}', '{}'::jsonb)) as slot(key, value)
      where slot.key <> 'value'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(slot.value->'children', '[]'::jsonb)) as child(block)
          where child.block#>>'{props,blockId}' = 'records-grid'
        )
    )
  limit 1;

  if visual_root_index is null then
    raise exception 'The route designer visual container could not be located.';
  end if;

  select slot.key
  into visual_slot_key
  from jsonb_each(
    coalesce(
      next_schema #> array[
        'visualEditor', 'pages', '/', 'blocks', visual_root_index::text, 'props', 'slots'
      ],
      '{}'::jsonb
    )
  ) as slot(key, value)
  where slot.key <> 'value'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(slot.value->'children', '[]'::jsonb)) as child(block)
      where child.block#>>'{props,blockId}' = 'records-grid'
    )
  limit 1;

  if visual_slot_key is null then
    raise exception 'The route designer visual left slot could not be located.';
  end if;

  visual_left_path := array[
    'visualEditor', 'pages', '/', 'blocks', visual_root_index::text,
    'props', 'slots', visual_slot_key, 'children'
  ];

  select jsonb_agg(
    case
      when entry.block#>>'{props,blockId}' = 'records-grid' then
        jsonb_set(
          jsonb_set(
            entry.block,
            '{props}',
            (
              coalesce(entry.block->'props', '{}'::jsonb)
              - 'entityCode'
            ) || jsonb_build_object(
              'data', '[]'::jsonb,
              'title', 'BOM 结构',
              'stripe', false,
              'sourceKey', 'records-grid',
              'sourceType', 'custom',
              'tableName', '',
              'viewName', '',
              'serviceName', 'planning',
              'serviceMethod', 'getPlanningConsoleData',
              'postDataJson', '{"dataset":"bom","filters":{"itemId":"{{ forms.edit-form.name }}"}}',
              'showRowActions', false,
              'columns', jsonb_build_array(
                jsonb_build_object(
                  'field', 'title',
                  'title', 'BOM 节点',
                  'minWidth', 220,
                  'treeNode', true,
                  'visible', true,
                  'resizable', true,
                  'showOverflow', 'tooltip'
                ),
                jsonb_build_object(
                  'field', 'quantity',
                  'title', '用量',
                  'width', 88,
                  'align', 'right',
                  'visible', true,
                  'resizable', true,
                  'formatter', jsonb_build_object(
                    'type', 'number',
                    'locale', 'zh-CN',
                    'emptyText', '-'
                  )
                ),
                jsonb_build_object(
                  'field', 'uom',
                  'title', '单位',
                  'width', 72,
                  'visible', true,
                  'resizable', true,
                  'showOverflow', 'tooltip'
                )
              ),
              'rowConfig', jsonb_build_object(
                'keyField', 'id',
                'useKey', true,
                'isCurrent', true,
                'isHover', true
              ),
              'treeConfig', jsonb_build_object(
                'childrenField', 'children',
                'expandAll', true
              )
            ),
            true
          ),
          '{focus}',
          'false'::jsonb,
          true
        )
      else entry.block
    end
    order by entry.ordinality
  )
  into visual_left_blocks
  from jsonb_array_elements(coalesce(next_schema #> visual_left_path, '[]'::jsonb))
    with ordinality as entry(block, ordinality);

  if visual_left_blocks is null then
    raise exception 'The route designer visual left blocks could not be updated.';
  end if;

  next_schema := jsonb_set(next_schema, visual_left_path, visual_left_blocks, false);

  if next_schema is distinct from page_schema then
    update public.lowcode_pages
    set schema = next_schema,
        version = version + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    where code = 'planning_route_designer'
    returning version into next_version;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    select id, version, schema, published_at
    from public.lowcode_pages
    where code = 'planning_route_designer'
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end $$;

do $$
declare
  configured boolean;
begin
  select exists (
    select 1
    from public.lowcode_pages page
    cross join lateral jsonb_path_query(
      page.schema,
      '$.blocks.** ? (@.id == "records-grid" && @.kind == "grid")'
    ) as grid(block)
    where page.code = 'planning_route_designer'
      and grid.block#>>'{schema,grid,treeConfig,childrenField}' = 'children'
      and grid.block#>>'{schema,grid,columns,0,treeNode}' = 'true'
      and page.schema#>>'{dataSources,records-grid,serviceName}' = 'planning'
      and page.schema#>>'{dataSources,records-grid,serviceMethod}' = 'getPlanningConsoleData'
      and page.schema#>>'{dataSources,records-grid,postData,dataset}' = 'bom'
      and page.schema#>>'{dataSources,records-grid,postData,filters,itemId}' = '{{ forms.edit-form.name }}'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) as handler(value)
        where handler.value->>'event' = 'form.fieldChange'
          and handler.value->>'blockId' = 'edit-form'
          and handler.value#>>'{directives,0,type}' = 'refreshDataSources'
          and handler.value#>>'{directives,0,sourceKeys,0}' = 'records-grid'
      )
  ) into configured;

  if not configured then
    raise exception 'The route designer BOM tree-grid configuration was not installed.';
  end if;
end $$;

commit;
