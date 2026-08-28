-- Keep planning category target types in a reusable option source instead of page-local enum maps.

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
  'planning_category_target_type',
  U&'\8BA1\5212\7C7B\522B\5BF9\8C61',
  U&'\4E3B\6570\636E\7C7B\522B\9002\7528\4E8E\7269\6599\3001\5BA2\6237\3001\4F9B\5E94\5546\548C\8D44\6E90\7684\5BF9\8C61\7C7B\578B\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  65,
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
) values
  ('planning_category_target_type', U&'\7269\6599', 'item', 'active', 10, true, '{}'::jsonb),
  ('planning_category_target_type', U&'\5BA2\6237', 'customer', 'active', 20, true, '{}'::jsonb),
  ('planning_category_target_type', U&'\4F9B\5E94\5546', 'supplier', 'active', 30, true, '{}'::jsonb),
  ('planning_category_target_type', U&'\8D44\6E90', 'resource', 'active', 40, true, '{}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'planning_category_target_type'
  and value not in ('item', 'customer', 'supplier', 'resource');

do $update_pages$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'planning_category-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page planning_category-edit does not exist.';
  end if;

  v_next_schema := jsonb_set(
    v_schema,
    '{blocks,1,schema,fields}',
    (
      select jsonb_agg(
        case
          when field_item->>'field' = 'target_type' then
            jsonb_set(
              field_item - 'options' - 'optionsSourceKey',
              '{optionsCode}',
              to_jsonb('planning_category_target_type'::text),
              true
            )
          else field_item
        end
        order by ordinal
      )
      from jsonb_array_elements(v_schema#>'{blocks,1,schema,fields}')
        with ordinality fields(field_item, ordinal)
    ),
    true
  );

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = coalesce(v_version, 0) + 1,
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

  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'planning_category-list'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page planning_category-list does not exist.';
  end if;

  v_next_schema := jsonb_set(
    v_schema,
    '{blocks,2,schema,grid,columns}',
    (
      select jsonb_agg(
        case
          when column_item->>'field' = 'target_type' then
            jsonb_set(
              column_item - 'formatter',
              '{params}',
              coalesce(column_item->'params', '{}'::jsonb) || jsonb_build_object(
                'lowcodeField',
                coalesce(column_item#>'{params,lowcodeField}', '{}'::jsonb) || jsonb_build_object(
                  'component', 'vxe-select',
                  'optionsCode', 'planning_category_target_type'
                )
              ),
              true
            )
          else column_item
        end
        order by ordinal
      )
      from jsonb_array_elements(v_schema#>'{blocks,2,schema,grid,columns}')
        with ordinality columns(column_item, ordinal)
    ),
    true
  );

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = coalesce(v_version, 0) + 1,
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
$update_pages$;

do $validation$
declare
  v_values text[];
  v_edit_field jsonb;
  v_grid_column jsonb;
begin
  select array_agg(value order by sort_order)
  into v_values
  from public.system_option_items
  where source_code = 'planning_category_target_type'
    and status = 'active';

  select field_item
  into v_edit_field
  from public.lowcode_pages page,
    lateral jsonb_array_elements(page.schema#>'{blocks,1,schema,fields}') field_item
  where page.code = 'planning_category-edit'
    and field_item->>'field' = 'target_type';

  select column_item
  into v_grid_column
  from public.lowcode_pages page,
    lateral jsonb_array_elements(page.schema#>'{blocks,2,schema,grid,columns}') column_item
  where page.code = 'planning_category-list'
    and column_item->>'field' = 'target_type';

  if v_values <> array['item', 'customer', 'supplier', 'resource']::text[]
    or v_edit_field->>'optionsCode' <> 'planning_category_target_type'
    or v_edit_field ? 'options'
    or v_grid_column ? 'formatter'
    or v_grid_column#>>'{params,lowcodeField,optionsCode}' <> 'planning_category_target_type'
  then
    raise exception 'Planning category target type option-source migration validation failed: values %, edit %, column %.',
      v_values, v_edit_field, v_grid_column;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
