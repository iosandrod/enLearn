-- Restore the row data binding for the low-code page management edit page.
-- The page-information dialog clears this binding on its cloned form, so the
-- shared edit page can safely load the row selected from the management grid.

begin;

do $migration$
declare
  list_page public.lowcode_pages%rowtype;
  edit_page public.lowcode_pages%rowtype;
  next_schema jsonb;
  next_blocks jsonb;
  next_version integer;
begin
  select *
  into list_page
  from public.lowcode_pages
  where code = 'lowcode-pages'
  limit 1;

  if list_page.id is null then
    raise exception 'Low-code page management page does not exist.';
  end if;

  if list_page.edit_page_id is not null then
    select *
    into edit_page
    from public.lowcode_pages
    where id = list_page.edit_page_id
    limit 1;
  end if;

  if edit_page.id is null then
    select *
    into edit_page
    from public.lowcode_pages
    where code = 'lowcode-pages-edit'
    limit 1;
  end if;

  if edit_page.id is null then
    raise exception 'The edit page associated with lowcode-pages does not exist.';
  end if;

  next_schema := jsonb_set(
    coalesce(edit_page.schema, '{}'::jsonb),
    '{dataSources,record}',
    jsonb_build_object(
      'key', 'record',
      'label', '低代码页面记录',
      'serviceName', 'lowcode',
      'serviceMethod', 'listItems',
      'saveMethod', 'saveItem',
      'tableName', 'lowcode_pages',
      'postData', jsonb_build_object(
        'resource', 'lowcode_pages',
        'tableName', 'lowcode_pages',
        'filters', jsonb_build_object('id', '{{ route.query.id }}'),
        'requiredFilters', jsonb_build_array('id'),
        'limit', 1
      ),
      'autoLoad', true
    ),
    true
  );

  select coalesce(jsonb_agg(
    case
      when block.value->>'kind' = 'form' then
        block.value
          || jsonb_build_object(
            'sourceKey', 'record',
            'submitSourceKey', 'record'
          )
      else block.value
    end
    order by block.ordinality
  ), '[]'::jsonb)
  into next_blocks
  from jsonb_array_elements(coalesce(next_schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality);

  next_schema := jsonb_set(next_schema, '{blocks}', next_blocks, true);

  if next_schema is distinct from edit_page.schema then
    next_version := edit_page.version + 1;

    update public.lowcode_pages
    set
      schema = next_schema,
      page_type = 'edit',
      version = next_version,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = edit_page.id;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    values (edit_page.id, next_version, next_schema, timezone('utc'::text, now()))
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end;
$migration$;

select pg_notify('pgrst', 'reload schema');

commit;
