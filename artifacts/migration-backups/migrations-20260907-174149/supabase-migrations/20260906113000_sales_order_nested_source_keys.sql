-- Complete nested source-key references stored in stringified directive JSON.
begin;

do $$
declare
  v_page record;
  v_mapping jsonb;
  v_next_schema jsonb;
  v_next_version integer;
  v_schema_text text;
  v_old_key text;
  v_new_key text;
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

    v_schema_text := v_page.schema::text;
    for v_old_key, v_new_key in
      select key, value from jsonb_each_text(v_mapping)
    loop
      v_schema_text := replace(v_schema_text,
        '"sourceKey": "' || v_old_key || '"',
        '"sourceKey": "' || v_new_key || '"');
      v_schema_text := replace(v_schema_text,
        '\"sourceKey\":\"' || v_old_key || '\"',
        '\"sourceKey\":\"' || v_new_key || '\"');
      v_schema_text := replace(v_schema_text,
        '"parentSourceKey": "' || v_old_key || '"',
        '"parentSourceKey": "' || v_new_key || '"');
    end loop;

    v_next_schema := v_schema_text::jsonb;
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
