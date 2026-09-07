-- The planning_route option source returns { label, value } rows.  The page
-- field was incorrectly configured with optionProps.value = 'id', causing
-- LowCodeForm to fall back to the label for the submitted value.
begin;

do $migration$
declare
  v_page_id uuid;
  v_schema jsonb;
  v_block_index text;
  v_field_index text;
  v_path text[];
  v_version integer;
begin
  select id, schema, version
    into v_page_id, v_schema, v_version
  from public.lowcode_pages
  where code = 'planning_route_designer'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page planning_route_designer does not exist.';
  end if;

  select (block_index - 1)::text
    into v_block_index
  from jsonb_array_elements(coalesce(v_schema->'blocks', '[]'::jsonb))
    with ordinality as blocks(block, block_index)
  where blocks.block->>'id' = 'planning_route_designer_filter'
  limit 1;

  select (field_index - 1)::text
    into v_field_index
  from jsonb_array_elements(
    coalesce(v_schema->'blocks'->(v_block_index::integer)->'schema'->'fields', '[]'::jsonb)
  ) with ordinality as fields(field, field_index)
  where fields.field->>'field' = 'operationId'
  limit 1;

  if v_block_index is null or v_field_index is null then
    raise exception 'Planning route designer operationId field was not found.';
  end if;

  v_path := array[
    'blocks', v_block_index, 'schema', 'fields', v_field_index
  ];
  v_schema := jsonb_set(
    v_schema,
    v_path || array['optionProps', 'value'],
    '"value"'::jsonb,
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
