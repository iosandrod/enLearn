-- Give the sales-order document-type field its own reusable option source.

begin;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
) values (
  'sales_order_document_type',
  U&'\9500\552E\8BA2\5355\5355\636E\7C7B\578B',
  U&'\9500\552E\8BA2\5355\53EF\9009\62E9\7684\4E1A\52A1\5355\636E\7C7B\578B\3002',
  'dict',
  jsonb_build_object(
    'labelField', 'label',
    'valueField', 'label'
  ),
  0,
  'active',
  55,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values (
  'sales_order_document_type',
  U&'\6807\51C6\9500\552E\8BA2\5355',
  'STD-SO',
  'active',
  10,
  true,
  jsonb_build_object('documentTypeCode', 'STD-SO')
)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

create or replace function pg_temp.patch_sales_order_document_type(value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb := value;
  v_props jsonb;
  v_initial_values jsonb;
begin
  if value is null then
    return value;
  end if;

  if jsonb_typeof(value) = 'array' then
    select coalesce(
      jsonb_agg(pg_temp.patch_sales_order_document_type(entry.item) order by entry.ordinality),
      '[]'::jsonb
    )
    into v_result
    from jsonb_array_elements(value) with ordinality as entry(item, ordinality);

    return v_result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  select coalesce(
    jsonb_object_agg(entry.key, pg_temp.patch_sales_order_document_type(entry.item)),
    '{}'::jsonb
  )
  into v_result
  from jsonb_each(value) as entry(key, item);

  if v_result->>'field' = 'doc_type_name' and v_result ? 'component' then
    v_props := coalesce(v_result->'props', '{}'::jsonb) || jsonb_build_object(
      'clearable', true,
      'placeholder', U&'\8BF7\9009\62E9\5355\636E\7C7B\578B'
    );
    v_result := v_result || jsonb_build_object(
      'component', 'vxe-select',
      'optionsCode', 'sales_order_document_type',
      'props', v_props
    );

    if v_result ? 'options' then
      v_result := jsonb_set(v_result, '{options}', '[]'::jsonb, false);
    end if;
    if v_result ? 'placeholder' then
      v_result := jsonb_set(
        v_result,
        '{placeholder}',
        to_jsonb(U&'\8BF7\9009\62E9\5355\636E\7C7B\578B'::text),
        false
      );
    end if;
    if v_result ? 'propsJson' then
      v_result := jsonb_set(v_result, '{propsJson}', to_jsonb(v_props::text), false);
    end if;
    if v_result ? 'optionsJson' then
      v_result := jsonb_set(v_result, '{optionsJson}', to_jsonb('[]'::text), false);
    end if;
  end if;

  if v_result#>>'{props,name}' = 'doc_type_name' then
    v_props := (
      coalesce(v_result->'props', '{}'::jsonb) - 'type' - 'maxlength'
    ) || jsonb_build_object(
      '__lowcodeOptionsCode', 'sales_order_document_type',
      'columns', jsonb_build_array(jsonb_build_object(
        'label', U&'\6807\51C6\9500\552E\8BA2\5355',
        'value', U&'\6807\51C6\9500\552E\8BA2\5355'
      )),
      'placeholder', U&'\8BF7\9009\62E9\5355\636E\7C7B\578B'
    );
    v_result := v_result || jsonb_build_object(
      'componentKey', 'picker',
      'label', 'Picker',
      'props', v_props
    );
  end if;

  if v_result->>'id' = 'sales-order-edit-form' and v_result->>'kind' = 'form' then
    v_initial_values := coalesce(v_result->'initialValues', '{}'::jsonb) || jsonb_build_object(
      'doc_type_code', 'STD-SO',
      'doc_type_name', U&'\6807\51C6\9500\552E\8BA2\5355'
    );
    v_result := jsonb_set(v_result, '{initialValues}', v_initial_values, true);
  end if;

  if v_result#>>'{props,blockId}' = 'sales-order-edit-form'
    and jsonb_typeof(v_result#>'{props,initialValuesJson}') = 'string'
  then
    begin
      v_initial_values := coalesce(
        (v_result#>>'{props,initialValuesJson}')::jsonb,
        '{}'::jsonb
      ) || jsonb_build_object(
        'doc_type_code', 'STD-SO',
        'doc_type_name', U&'\6807\51C6\9500\552E\8BA2\5355'
      );
      v_result := jsonb_set(
        v_result,
        '{props,initialValuesJson}',
        to_jsonb(v_initial_values::text),
        false
      );
    exception
      when invalid_text_representation then
        raise exception 'Sales-order visual initialValuesJson is invalid JSON.';
    end;
  end if;

  return v_result;
end;
$function$;

do $update_page$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  v_next_schema := pg_temp.patch_sales_order_document_type(v_schema);

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
end;
$update_page$;

do $validation$
declare
  v_source_count integer;
  v_item_count integer;
  v_field jsonb;
  v_initial_values jsonb;
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'sales_order_document_type'
    and source_type = 'dict'
    and source_config->>'valueField' = 'label'
    and status = 'active';

  select count(*)::integer
  into v_item_count
  from public.system_option_items
  where source_code = 'sales_order_document_type'
    and value = 'STD-SO'
    and label = U&'\6807\51C6\9500\552E\8BA2\5355'
    and status = 'active';

  select field_item, block_item->'initialValues'
  into v_field, v_initial_values
  from public.lowcode_pages pages,
    lateral jsonb_array_elements(pages.schema->'blocks') block_item,
    lateral jsonb_array_elements(block_item->'schema'->'fields') field_item
  where pages.code = 'sales-orders-edit'
    and block_item->>'id' = 'sales-order-edit-form'
    and field_item->>'field' = 'doc_type_name';

  if v_source_count <> 1
    or v_item_count <> 1
    or v_field->>'component' <> 'vxe-select'
    or v_field->>'optionsCode' <> 'sales_order_document_type'
    or v_field#>>'{props,placeholder}' <> U&'\8BF7\9009\62E9\5355\636E\7C7B\578B'
    or v_initial_values->>'doc_type_code' <> 'STD-SO'
    or v_initial_values->>'doc_type_name' <> U&'\6807\51C6\9500\552E\8BA2\5355'
  then
    raise exception 'Sales-order document-type option validation failed: source %, item %, field %, initial values %.',
      v_source_count, v_item_count, v_field, v_initial_values;
  end if;
end;
$validation$;

drop function pg_temp.patch_sales_order_document_type(jsonb);

select pg_notify('pgrst', 'reload schema');

commit;
