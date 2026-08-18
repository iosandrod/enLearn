-- Add a business display name while preserving planning_item.name as the
-- stable material code used by frePPLe and external-order mappings.

begin;

alter table public.planning_item
  add column if not exists display_name text;

alter table public.planning_item
  alter column display_name drop default;

do $backfill$
begin
  if to_regclass('public.sales_order_lines') is not null then
    execute $sql$
      update public.planning_item item
      set display_name = coalesce((
        select nullif(btrim(line.item_name), '')
        from public.sales_order_lines line
        where line.account_id = item.account_id
          and line.item_code = item.name
          and nullif(btrim(line.item_name), '') is not null
        order by line.updated_at desc nulls last, line.id
        limit 1
      ), item.display_name)
      where nullif(btrim(item.display_name), '') is null
    $sql$;
  end if;
end
$backfill$;

update public.planning_item
set display_name = coalesce(nullif(btrim(description), ''), name)
where nullif(btrim(display_name), '') is null;

alter table public.planning_item
  alter column display_name set not null;

comment on column public.planning_item.name is
  '{"title":"物料编码","type":"text","align":"left","description":"物料在账套内的稳定唯一编码，同时作为 frePPLe 物料键和外部订单编码匹配键。"}';
comment on column public.planning_item.display_name is
  '{"title":"物料名称","type":"text","align":"left","description":"面向业务用户显示的独立物料名称。"}';

do $registry$
declare
  next_config jsonb;
  next_fields jsonb;
  next_hash text;
  config_path text[];
begin
  select registry.config
  into next_config
  from public.dynamic_crud_resource_registry registry
  where registry.resource_name = 'planning_item'
    and registry.table_name = 'planning_item';

  if next_config is not null then
    foreach config_path slice 1 in array array[
      array['resources', 'planning_item', 'create', 'allowed_fields'],
      array['resources', 'planning_item', 'create', 'input_allowed_fields'],
      array['resources', 'planning_item', 'create', 'required_fields'],
      array['resources', 'planning_item', 'update', 'allowed_fields'],
      array['resources', 'planning_item', 'update', 'input_allowed_fields']
    ]
    loop
      select coalesce(
        jsonb_agg(field_value order by ordinal)
          filter (where field_value <> to_jsonb('display_name'::text)),
        '[]'::jsonb
      ) || jsonb_build_array('display_name')
      into next_fields
      from jsonb_array_elements(coalesce(next_config #> config_path, '[]'::jsonb))
        with ordinality fields(field_value, ordinal);

      next_config := jsonb_set(next_config, config_path, next_fields, true);
    end loop;

    next_config := next_config - 'config_hash';
    next_hash := encode(
      digest(convert_to(next_config::text, 'UTF8'), 'sha256'),
      'hex'
    );
    next_config := jsonb_set(
      next_config,
      '{config_hash}',
      to_jsonb(next_hash),
      true
    );

    update public.dynamic_crud_resource_registry
    set config = next_config,
        config_hash = next_hash,
        updated_at = timezone('utc'::text, now())
    where resource_name = 'planning_item'
      and table_name = 'planning_item';
  end if;
end
$registry$;

do $pages$
declare
  page_record record;
  next_schema jsonb;
  block_index integer;
  tab_index integer;
  field_index integer;
  search_index integer;
  columns_path text[];
  fields_path text[];
  initial_values_path text[];
  save_data_path text[];
begin
  for page_record in
    select id, code, schema
    from public.lowcode_pages
    where code in ('planning_item-list', 'planning_item-edit')
    for update
  loop
    next_schema := page_record.schema;

    if page_record.code = 'planning_item-list' then
      select ordinal - 1 into block_index
      from jsonb_array_elements(coalesce(next_schema->'blocks', '[]'::jsonb))
        with ordinality blocks(block, ordinal)
      where block->>'id' = 'planning_item-grid'
      limit 1;

      if block_index is not null then
        columns_path := array['blocks', block_index::text, 'schema', 'grid', 'columns'];
        next_schema := jsonb_set(
          next_schema,
          columns_path,
          (
            select jsonb_agg(
              case
                when column_item->>'field' = 'name' then
                  column_item || jsonb_build_object('title', '物料编码')
                else column_item
              end
              order by ordinal
            )
            from jsonb_array_elements(next_schema #> columns_path)
              with ordinality columns(column_item, ordinal)
          ),
          false
        );

        if not exists (
          select 1
          from jsonb_array_elements(next_schema #> columns_path) column_item
          where column_item->>'field' = 'display_name'
        ) then
          select ordinal into field_index
          from jsonb_array_elements(next_schema #> columns_path)
            with ordinality columns(column_item, ordinal)
          where column_item->>'field' = 'name'
          limit 1;

          next_schema := jsonb_insert(
            next_schema,
            columns_path || field_index::text,
            '{"field":"display_name","title":"物料名称","minWidth":180,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}'::jsonb,
            false
          );
        end if;
      end if;

      select ordinal - 1 into block_index
      from jsonb_array_elements(coalesce(next_schema->'blocks', '[]'::jsonb))
        with ordinality blocks(block, ordinal)
      where block->>'id' = 'planning_item-search'
      limit 1;

      if block_index is not null then
        fields_path := array['blocks', block_index::text, 'schema', 'fields'];
        next_schema := jsonb_set(
          next_schema,
          fields_path,
          (
            select jsonb_agg(
              case
                when field_item->>'field' = 'name' then
                  field_item || jsonb_build_object('label', '物料编码')
                else field_item
              end
              order by ordinal
            )
            from jsonb_array_elements(next_schema #> fields_path)
              with ordinality fields(field_item, ordinal)
          ),
          false
        );

        if not exists (
          select 1
          from jsonb_array_elements(next_schema #> fields_path) field_item
          where field_item->>'field' = 'display_name'
        ) then
          select ordinal into search_index
          from jsonb_array_elements(next_schema #> fields_path)
            with ordinality fields(field_item, ordinal)
          where field_item->>'field' = 'name'
          limit 1;

          next_schema := jsonb_insert(
            next_schema,
            fields_path || search_index::text,
            '{"field":"display_name","label":"物料名称","component":"vxe-input","props":{"clearable":true}}'::jsonb,
            false
          );
        end if;
      end if;
    else
      select root_ordinal - 1, tab_ordinal - 1, form_ordinal - 1
      into block_index, tab_index, field_index
      from jsonb_array_elements(coalesce(next_schema->'blocks', '[]'::jsonb))
        with ordinality root_blocks(root_block, root_ordinal)
      cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb))
        with ordinality tabs(tab_item, tab_ordinal)
      cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
        with ordinality form_blocks(form_block, form_ordinal)
      where form_block->>'id' = 'planning_item_edit_form'
      limit 1;

      if block_index is not null then
        fields_path := array['blocks', block_index::text, 'tabs', tab_index::text,
          'blocks', field_index::text, 'schema', 'fields'];
        initial_values_path := array['blocks', block_index::text, 'tabs', tab_index::text,
          'blocks', field_index::text, 'initialValues'];

        next_schema := jsonb_set(
          next_schema,
          fields_path,
          (
            select jsonb_agg(
              case
                when field_item->>'field' = 'name' then
                  jsonb_set(
                    field_item || jsonb_build_object('label', '物料编码'),
                    '{props,placeholder}',
                    '"请输入物料编码"'::jsonb,
                    true
                  ) || jsonb_build_object(
                    'rules', jsonb_build_array(jsonb_build_object(
                      'required', true,
                      'message', '请输入物料编码'
                    ))
                  )
                else field_item
              end
              order by ordinal
            )
            from jsonb_array_elements(next_schema #> fields_path)
              with ordinality fields(field_item, ordinal)
          ),
          false
        );

        if not exists (
          select 1
          from jsonb_array_elements(next_schema #> fields_path) field_item
          where field_item->>'field' = 'display_name'
        ) then
          select ordinal into search_index
          from jsonb_array_elements(next_schema #> fields_path)
            with ordinality fields(field_item, ordinal)
          where field_item->>'field' = 'name'
          limit 1;

          next_schema := jsonb_insert(
            next_schema,
            fields_path || search_index::text,
            '{"field":"display_name","label":"物料名称","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"请输入物料名称"},"rules":[{"required":true,"message":"请输入物料名称"}]}'::jsonb,
            false
          );
        end if;

        next_schema := jsonb_set(
          next_schema,
          initial_values_path,
          coalesce(next_schema #> initial_values_path, '{}'::jsonb)
            || jsonb_build_object('display_name', ''),
          true
        );
      end if;

      select array['blocks', (ordinal - 1)::text, 'actions', (action_ordinal - 1)::text,
        'directives', (directive_ordinal - 1)::text, 'postData', 'data']
      into save_data_path
      from jsonb_array_elements(coalesce(next_schema->'blocks', '[]'::jsonb))
        with ordinality blocks(block, ordinal)
      cross join lateral jsonb_array_elements(coalesce(block->'actions', '[]'::jsonb))
        with ordinality actions(action_item, action_ordinal)
      cross join lateral jsonb_array_elements(coalesce(action_item->'directives', '[]'::jsonb))
        with ordinality directives(directive_item, directive_ordinal)
      where action_item->>'code' = 'save'
        and directive_item->>'type' = 'invokeService'
      limit 1;

      if save_data_path is not null then
        next_schema := jsonb_set(
          next_schema,
          save_data_path,
          coalesce(next_schema #> save_data_path, '{}'::jsonb)
            || jsonb_build_object(
              'display_name', '{{ forms.planning_item_edit_form.display_name }}'
            ),
          true
        );
      end if;
    end if;

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
$pages$;

with normalized_entity as (
  select
    entity.id,
    jsonb_set(
      entity.schema,
      '{fields}',
      (
        select coalesce(jsonb_agg(
          case
            when field_item->>'name' = 'name' then
              field_item || jsonb_build_object(
                'label', '物料编码', 'kind', 'text', 'required', true
              )
            when field_item->>'name' = 'display_name' then
              field_item || jsonb_build_object(
                'label', '物料名称', 'kind', 'text', 'required', true
              )
            else field_item
          end
          order by ordinal
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(entity.schema->'fields', '[]'::jsonb))
          with ordinality fields(field_item, ordinal)
      ) || case
        when exists (
          select 1
          from jsonb_array_elements(coalesce(entity.schema->'fields', '[]'::jsonb)) field_item
          where field_item->>'name' = 'display_name'
        ) then '[]'::jsonb
        else '[{"name":"display_name","label":"物料名称","kind":"text","required":true}]'::jsonb
      end,
      true
    ) as next_schema
  from public.admin_entities entity
  where entity.code = 'planning_item'
)
update public.admin_entities entity
set schema = normalized_entity.next_schema,
    updated_at = timezone('utc'::text, now())
from normalized_entity
where entity.id = normalized_entity.id
  and entity.schema is distinct from normalized_entity.next_schema;

do $base_info$
declare
  page_record record;
  next_schema jsonb;
  fields_path text[];
  item_field jsonb;
begin
  for page_record in
    select id, schema
    from public.lowcode_pages
    where code = 'planning_operationmaterial-edit'
    for update
  loop
    select array['blocks', (root_ordinal - 1)::text, 'tabs', (tab_ordinal - 1)::text,
      'blocks', (form_ordinal - 1)::text, 'schema', 'fields']
    into fields_path
    from jsonb_array_elements(coalesce(page_record.schema->'blocks', '[]'::jsonb))
      with ordinality root_blocks(root_block, root_ordinal)
    cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb))
      with ordinality tabs(tab_item, tab_ordinal)
    cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
      with ordinality form_blocks(form_block, form_ordinal)
    where form_block->>'id' = 'planning_operationmaterial_edit_form'
    limit 1;

    if fields_path is null then continue; end if;

    select field_item into item_field
    from jsonb_array_elements(page_record.schema #> fields_path) field_item
    where field_item->>'field' = 'item_id'
      and field_item->>'component' = 'base-info'
    limit 1;

    if item_field is null then continue; end if;

    item_field := jsonb_set(
      jsonb_set(
        item_field,
        '{props,relateInfoConfig,displayField}',
        '["display_name","name"]'::jsonb,
        true
      ),
      '{props,relateInfoConfig,searchFields}',
      '["name","display_name"]'::jsonb,
      true
    );
    item_field := jsonb_set(
      item_field,
      '{props,relateInfoConfig,columns}',
      (
        select jsonb_agg(column_item order by ordinal)
        from (
          select column_item, ordinal
          from jsonb_array_elements(coalesce(
            item_field#>'{props,relateInfoConfig,columns}', '[]'::jsonb
          )) with ordinality columns(column_item, ordinal)
          union all
          select '{"field":"display_name","title":"物料名称","minWidth":200}'::jsonb, 1.5
          where not exists (
            select 1
            from jsonb_array_elements(coalesce(
              item_field#>'{props,relateInfoConfig,columns}', '[]'::jsonb
            )) column_item
            where column_item->>'field' = 'display_name'
          )
        ) ordered_columns
      ),
      true
    );

    next_schema := jsonb_set(
      page_record.schema,
      fields_path,
      (
        select jsonb_agg(
          case when field_item->>'field' = 'item_id' then item_field else field_item end
          order by ordinal
        )
        from jsonb_array_elements(page_record.schema #> fields_path)
          with ordinality fields(field_item, ordinal)
      ),
      false
    );

    if next_schema is distinct from page_record.schema then
      update public.lowcode_pages
      set schema = next_schema,
          version = version + 1,
          published_at = timezone('utc'::text, now()),
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
$base_info$;

select pg_notify('pgrst', 'reload schema');

commit;
