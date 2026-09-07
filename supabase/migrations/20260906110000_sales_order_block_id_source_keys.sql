-- Migrate the sales-order low-code pages to use block ids as source keys.
-- This changes only persisted lowcode_pages.schema JSON; application source is unchanged.
begin;

create or replace function pg_temp.replace_source_refs(
  p_value jsonb,
  p_mapping jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_entry record;
  v_item record;
  v_text text;
  v_replacement text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select jsonb_object_agg(
        entry.key,
        case
          when entry.key in ('sourceKey', 'targetSourceKey', 'submitSourceKey', 'deleteSourceKey')
            and jsonb_typeof(entry.value) = 'string'
            then to_jsonb(coalesce(p_mapping ->> (entry.value #>> '{}'), entry.value #>> '{}'))
          when entry.key in ('sourceKeys', 'targetSourceKeys')
            and jsonb_typeof(entry.value) = 'array'
            then (
              select coalesce(jsonb_agg(to_jsonb(coalesce(p_mapping ->> (item.value #>> '{}'), item.value #>> '{}'))), '[]'::jsonb)
              from jsonb_array_elements(entry.value) as item(value)
            )
          else pg_temp.replace_source_refs(entry.value, p_mapping)
        end
      )
      into v_result
      from jsonb_each(p_value) as entry(key, value);

      -- Replace source-key tokens inside scripts after recursively rebuilding the object.
      for v_entry in select key, value from jsonb_each_text(coalesce(v_result, '{}'::jsonb)) where key in ('script', 'source_code') loop
        v_text := v_entry.value;
        for v_item in select key, value from jsonb_each_text(p_mapping) order by length(key) desc loop
          v_text := replace(v_text, v_item.key, v_item.value);
        end loop;
        v_result := jsonb_set(v_result, array[v_entry.key], to_jsonb(v_text), true);
      end loop;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select coalesce(jsonb_agg(pg_temp.replace_source_refs(item.value, p_mapping) order by item.ordinality), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;

    else
      return p_value;
  end case;
end;
$function$;

create or replace function pg_temp.rename_page_data_sources(
  p_schema jsonb,
  p_mapping jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_sources jsonb;
  v_result jsonb;
  v_entry record;
  v_new_key text;
  v_source jsonb;
begin
  v_sources := coalesce(p_schema -> 'dataSources', '{}'::jsonb);
  select coalesce(jsonb_object_agg(renamed.v_new_key, renamed.v_source), '{}'::jsonb)
  into v_result
  from (
    select
      coalesce(p_mapping ->> entry.key, entry.key) as v_new_key,
      jsonb_set(
        pg_temp.replace_source_refs(entry.value, p_mapping),
        '{key}',
        to_jsonb(coalesce(p_mapping ->> entry.key, entry.key)),
        true
      ) as v_source
    from jsonb_each(v_sources) as entry(key, value)
  ) as renamed;

  return jsonb_set(p_schema, '{dataSources}', coalesce(v_result, '{}'::jsonb), true);
end;
$function$;

create or replace function pg_temp.force_block_source_key(
  p_value jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_entry record;
  v_id text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select jsonb_object_agg(entry.key, pg_temp.force_block_source_key(entry.value))
      into v_result
      from jsonb_each(p_value) as entry(key, value);

      v_id := p_value ->> 'id';
      if v_id is not null and p_value ? 'kind' and p_value ? 'sourceKey' then
        v_result := jsonb_set(v_result, '{sourceKey}', to_jsonb(v_id), true);
      end if;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select coalesce(jsonb_agg(pg_temp.force_block_source_key(item.value) order by item.ordinality), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinality);
      return v_result;

    else
      return p_value;
  end case;
end;
$function$;

do $$
declare
  v_page record;
  v_mapping jsonb;
  v_next_schema jsonb;
  v_next_version integer;
begin
  for v_page in
    select id, code, version, schema
    from public.lowcode_pages
    where code in ('sales-orders', 'sales-orders-edit')
    for update
  loop
    v_mapping := case v_page.code
      when 'sales-orders' then '{"salesOrders":"sales-order-grid","salesOrderLines":"sales-order-lines-grid"}'::jsonb
      when 'sales-orders-edit' then '{"salesOrder":"sales-order-edit-form","salesOrderLines":"sales-order-lines-grid"}'::jsonb
      else '{}'::jsonb
    end;

    v_next_schema := pg_temp.replace_source_refs(v_page.schema, v_mapping);
    v_next_schema := pg_temp.rename_page_data_sources(v_next_schema, v_mapping);
    v_next_schema := pg_temp.force_block_source_key(v_next_schema);

    if v_next_schema is distinct from v_page.schema then
      v_next_version := v_page.version + 1;
      update public.lowcode_pages
      set schema = v_next_schema,
          version = v_next_version,
          published_at = timezone('utc'::text, now()),
          updated_at = timezone('utc'::text, now())
      where id = v_page.id;

      insert into public.lowcode_page_versions (page_id, version, schema, published_at)
      values (v_page.id, v_next_version, v_next_schema, timezone('utc'::text, now()))
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end loop;
end $$;

select pg_notify('pgrst', 'reload schema');
commit;
