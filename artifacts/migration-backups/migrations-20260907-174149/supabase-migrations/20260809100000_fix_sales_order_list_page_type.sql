-- Restore list-page metadata without replacing the sales-order page schema.

do $$
declare
  v_list_page_id uuid;
  v_edit_page_id uuid;
  v_current_page_type text;
  v_current_edit_page_id uuid;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_current_version integer;
  v_changed boolean;
begin
  select id
  into v_edit_page_id
  from public.lowcode_pages
  where code = 'sales-orders-edit';

  if v_edit_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  select id, page_type, edit_page_id, schema, version
  into
    v_list_page_id,
    v_current_page_type,
    v_current_edit_page_id,
    v_current_schema,
    v_current_version
  from public.lowcode_pages
  where code = 'sales-orders'
  for update;

  if v_list_page_id is null then
    raise exception 'Low-code page sales-orders does not exist.';
  end if;

  v_next_schema := jsonb_set(
    coalesce(v_current_schema, '{}'::jsonb),
    '{pageType}',
    to_jsonb('list'::text),
    true
  );
  v_changed :=
    v_current_page_type is distinct from 'list'
    or v_current_edit_page_id is distinct from v_edit_page_id
    or v_current_schema is distinct from v_next_schema;

  update public.lowcode_pages
  set
    page_type = 'list',
    edit_page_id = v_edit_page_id,
    schema = v_next_schema,
    version = case
      when v_changed then v_current_version + 1
      else v_current_version
    end,
    published_at = case
      when v_changed then timezone('utc'::text, now())
      else published_at
    end,
    updated_at = case
      when v_changed then timezone('utc'::text, now())
      else updated_at
    end
  where id = v_list_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where id = v_list_page_id
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

select pg_notify('pgrst', 'reload schema');
