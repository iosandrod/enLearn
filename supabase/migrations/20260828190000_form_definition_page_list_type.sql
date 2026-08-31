-- The system form-definition page is list-shaped and uses list page functions.
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
  where code = 'form-definetion'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page form-definetion does not exist.';
  end if;

  v_next_schema := jsonb_set(v_current_schema, '{pageType}', '"list"'::jsonb, true);
  if v_next_schema = v_current_schema and exists (
    select 1
    from public.lowcode_pages
    where id = v_page_id
      and page_type = 'list'
  ) then
    return;
  end if;

  v_next_version := v_current_version + 1;
  update public.lowcode_pages
  set page_type = 'list',
      schema = v_next_schema,
      version = v_next_version,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

select pg_notify('pgrst', 'reload schema');
