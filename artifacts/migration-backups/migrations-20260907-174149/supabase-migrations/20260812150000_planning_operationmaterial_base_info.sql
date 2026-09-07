-- Use the base-info material for the item field on the operation-material edit page.

begin;

do $migration$
declare
  v_page_id uuid;
  v_schema jsonb;
  v_fields_path text[];
  v_item_field jsonb;
  v_original_item_field jsonb;
begin
  select id, schema
  into v_page_id, v_schema
  from public.lowcode_pages
  where code = 'planning_operationmaterial-edit'
  order by updated_at desc
  limit 1
  for update;

  if v_page_id is null then
    raise exception 'Low-code page planning_operationmaterial-edit was not found.';
  end if;

  select array['blocks', (block_ordinal - 1)::text, 'tabs', (tab_ordinal - 1)::text,
    'blocks', (form_ordinal - 1)::text, 'schema', 'fields']
  into v_fields_path
  from jsonb_array_elements(coalesce(v_schema->'blocks', '[]'::jsonb))
    with ordinality root_blocks(root_block, block_ordinal)
  cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb))
    with ordinality tabs(tab_item, tab_ordinal)
  cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
    with ordinality form_blocks(form_block, form_ordinal)
  where form_block->>'id' = 'planning_operationmaterial_edit_form'
  limit 1;

  if v_fields_path is null then
    raise exception 'Form planning_operationmaterial_edit_form was not found.';
  end if;

  select field_item
  into v_item_field
  from jsonb_array_elements(v_schema #> v_fields_path) field_item
  where field_item->>'field' = 'item_id'
  limit 1;

  if v_item_field is null then
    raise exception 'Field item_id was not found.';
  end if;

  v_original_item_field = v_item_field;

  v_item_field = jsonb_set(v_item_field, '{component}', '"base-info"'::jsonb, true);
  v_item_field = v_item_field - 'optionsSourceKey' - 'optionProps';
  v_item_field = jsonb_set(
    v_item_field,
    '{props}',
    coalesce(v_item_field->'props', '{}'::jsonb) - 'filterable' || jsonb_build_object(
      'clearable', true,
      'placeholder', U&'\8BF7\9009\62E9\7269\6599',
      'relateInfoConfig', jsonb_build_object(
        'sourceType', 'entity',
        'entityCode', 'planning_item',
        'tableName', 'planning_item',
        'resource', 'planning_item',
        'serviceName', 'planning',
        'serviceMethod', 'listItems',
        'valueField', 'id',
        'displayField', 'name',
        'displayValueField', 'item_id_label',
        'searchField', 'name',
        'searchable', true,
        'pageSize', 100,
        'fieldMappings', jsonb_build_array(
          jsonb_build_object('sourceField', 'id', 'targetField', 'item_id')
        ),
        'columns', jsonb_build_array(
          jsonb_build_object('field', 'name', 'title', U&'\7269\6599\7F16\7801', 'minWidth', 180),
          jsonb_build_object('field', 'description', 'title', U&'\63CF\8FF0', 'minWidth', 220),
          jsonb_build_object('field', 'category', 'title', U&'\7C7B\522B', 'minWidth', 120),
          jsonb_build_object('field', 'subcategory', 'title', U&'\5B50\7C7B\522B', 'minWidth', 120),
          jsonb_build_object('field', 'uom', 'title', U&'\5355\4F4D', 'minWidth', 100),
          jsonb_build_object('field', 'source', 'title', U&'\6570\636E\6765\6E90', 'minWidth', 140)
        )
      )
    ),
    true
  );

  if v_item_field is distinct from v_original_item_field then
    v_schema = jsonb_set(
      v_schema,
      v_fields_path,
      (
        select jsonb_agg(
          case when field_item->>'field' = 'item_id' then v_item_field else field_item end
          order by ordinal
        )
        from jsonb_array_elements(v_schema #> v_fields_path)
          with ordinality fields(field_item, ordinal)
      ),
      false
    );

    update public.lowcode_pages
    set schema = v_schema,
        version = version + 1,
        updated_at = timezone('utc'::text, now()),
        published_at = case
          when status = 'published' then timezone('utc'::text, now())
          else published_at
        end
    where id = v_page_id;
  end if;
end;
$migration$;

do $validation$
declare
  v_item_field jsonb;
begin
  select field_item
  into v_item_field
  from public.lowcode_pages pages
  cross join lateral jsonb_array_elements(coalesce(pages.schema->'blocks', '[]'::jsonb)) root_block
  cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb)) tab_item
  cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb)) form_block
  cross join lateral jsonb_array_elements(coalesce(form_block#>'{schema,fields}', '[]'::jsonb)) field_item
  where pages.code = 'planning_operationmaterial-edit'
    and form_block->>'id' = 'planning_operationmaterial_edit_form'
    and field_item->>'field' = 'item_id'
  order by pages.updated_at desc
  limit 1;

  if coalesce(v_item_field->>'component', '') <> 'base-info'
    or coalesce(v_item_field#>>'{props,relateInfoConfig,resource}', '') <> 'planning_item'
    or coalesce(v_item_field#>>'{props,relateInfoConfig,displayField}', '') <> 'name'
    or coalesce(v_item_field#>>'{props,relateInfoConfig,fieldMappings,0,targetField}', '') <> 'item_id'
    or v_item_field ? 'optionsSourceKey'
  then
    raise exception 'Operation-material base-info validation failed: %.', v_item_field;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
