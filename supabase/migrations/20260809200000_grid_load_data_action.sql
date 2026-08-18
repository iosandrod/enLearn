-- Mark the sales-order grids as main/detail and let the grid Action own data loading.

create or replace function pg_temp.set_lowcode_block_value(
  p_document jsonb,
  p_block_id text,
  p_path text[],
  p_value jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_block_id then
        return jsonb_set(p_document, p_path, p_value, true);
      end if;

      select jsonb_object_agg(entry.key, pg_temp.set_lowcode_block_value(
        entry.value,
        p_block_id,
        p_path,
        p_value
      ))
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(pg_temp.set_lowcode_block_value(
        item.value,
        p_block_id,
        p_path,
        p_value
      ) order by item.ordinality)
      into v_result
      from jsonb_array_elements(p_document) with ordinality as item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

create or replace function pg_temp.set_lowcode_array_item_value(
  p_document jsonb,
  p_block_id text,
  p_array_path text[],
  p_item_key text,
  p_item_value text,
  p_path text[],
  p_value jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_items jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_block_id then
        if jsonb_typeof(p_document #> p_array_path) <> 'array' then
          return p_document;
        end if;

        select jsonb_agg(
          case
            when item.value ->> p_item_key = p_item_value
              then jsonb_set(item.value, p_path, p_value, true)
            else item.value
          end
          order by item.ordinality
        )
        into v_items
        from jsonb_array_elements(coalesce(p_document #> p_array_path, '[]'::jsonb))
          with ordinality as item(value, ordinality);
        return jsonb_set(p_document, p_array_path, coalesce(v_items, '[]'::jsonb), true);
      end if;

      select jsonb_object_agg(entry.key, pg_temp.set_lowcode_array_item_value(
        entry.value,
        p_block_id,
        p_array_path,
        p_item_key,
        p_item_value,
        p_path,
        p_value
      ))
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(pg_temp.set_lowcode_array_item_value(
        item.value,
        p_block_id,
        p_array_path,
        p_item_key,
        p_item_value,
        p_path,
        p_value
      ) order by item.ordinality)
      into v_result
      from jsonb_array_elements(p_document) with ordinality as item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

do $$
declare
  v_page_id uuid;
  v_current_version integer;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_next_version integer;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'sales-orders'
  for update;

  if v_page_id is null then
    return;
  end if;

  v_next_schema := v_current_schema;
  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,salesOrderLines,postData,requiredFilters}',
    '["order_id"]'::jsonb,
    true
  );
  v_next_schema := pg_temp.set_lowcode_block_value(
    v_next_schema,
    'sales-order-grid',
    array['tableType'],
    '"main"'::jsonb
  );
  v_next_schema := pg_temp.set_lowcode_block_value(
    v_next_schema,
    'sales-order-grid',
    array['schema', 'events', 'rowCurrentChange'],
    '[
      {
        "type": "setDataSource",
        "sourceKey": "selectedSalesOrderRows",
        "value": ["{{ event.row }}"]
      },
      {
        "type": "setSearchFilters",
        "sourceKey": "salesOrderLines",
        "mode": "replace",
        "values": { "order_id": "{{ event.row.id }}" }
      }
    ]'::jsonb
  );
  v_next_schema := pg_temp.set_lowcode_block_value(
    v_next_schema,
    'sales-order-lines-grid',
    array['tableType'],
    '"detail"'::jsonb
  );

  if v_next_schema = v_current_schema then
    return;
  end if;

  v_next_version := v_current_version + 1;
  update public.lowcode_pages
  set schema = v_next_schema,
      version = v_next_version,
      updated_at = timezone('utc'::text, now())
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

do $$
declare
  v_page_id uuid;
  v_current_version integer;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_next_version integer;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    return;
  end if;

  v_next_schema := pg_temp.set_lowcode_block_value(
    v_current_schema,
    'sales-order-lines-grid',
    array['tableType'],
    '"detail"'::jsonb
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,capabilities}',
    coalesce(v_next_schema #> '{scriptPolicy,capabilities}', '[]'::jsonb) ||
      case
        when coalesce(v_next_schema #> '{scriptPolicy,capabilities}', '[]'::jsonb) @> '["action.execute"]'::jsonb
          then '[]'::jsonb
        else '["action.execute"]'::jsonb
      end,
    true
  );
  v_next_schema := pg_temp.set_lowcode_array_item_value(
    v_next_schema,
    'sales-order-lines-grid',
    array['schema', 'toolbar'],
    'code',
    'refresh-lines',
    array['script'],
    to_jsonb(
      'await this.executeAction({ node: ''sales-order-lines-grid'', method: ''loadData'', filters: { order_id: String(this.route.query.id || '''').trim() } });'::text
    )
  );

  if v_next_schema = v_current_schema then
    return;
  end if;

  v_next_version := v_current_version + 1;
  update public.lowcode_pages
  set schema = v_next_schema,
      version = v_next_version,
      updated_at = timezone('utc'::text, now())
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;
