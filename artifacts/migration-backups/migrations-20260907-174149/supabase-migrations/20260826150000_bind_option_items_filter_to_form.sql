-- Bind dictionary-detail filtering to the edit form instead of the list-shaped source payload.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'admin-system-options-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page admin-system-options-edit does not exist.';
  end if;

  v_next_schema := jsonb_set(
    v_schema,
    '{dataSources,optionItems,postData,filters,source_code}',
    to_jsonb('{{ forms.option-source-edit-form.code }}'::text),
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
end $$;

select pg_notify('pgrst', 'reload schema');
