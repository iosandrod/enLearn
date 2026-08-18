-- Reuse the edit page associated with the low-code page list as the page-information editor.

begin;

do $migration$
declare
  list_page public.lowcode_pages%rowtype;
  edit_page public.lowcode_pages%rowtype;
  page_info_schema jsonb;
  next_blocks jsonb;
  next_schema jsonb;
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

  select schema
  into page_info_schema
  from public.lowcode_form_definitions
  where code = 'page-info-design'
    and enabled = true
  limit 1;

  if page_info_schema is null then
    raise exception 'Page information form definition does not exist.';
  end if;

  page_info_schema := page_info_schema
    - 'componentKey'
    - 'extendsVisualProps'
    - 'mergeBuiltinFields'
    - 'separateArrayTableTabs';

  select coalesce(jsonb_agg(
    case
      when block.value->>'kind' = 'form' then
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(block.value, '{schema}', page_info_schema, true),
              '{initialValues}', '{}'::jsonb, true
            ),
            '{formType}', to_jsonb('default'::text), true
          ),
          '{title}', to_jsonb('页面信息'::text), true
        ) - 'sourceKey' - 'submitSourceKey'
      else block.value
    end
    order by block.ordinality
  ), '[]'::jsonb)
  into next_blocks
  from jsonb_array_elements(coalesce(edit_page.schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality);

  if not exists (
    select 1
    from jsonb_array_elements(next_blocks) block
    where block->>'kind' = 'form'
  ) then
    next_blocks := next_blocks || jsonb_build_array(
      jsonb_build_object(
        'id', 'lowcode-page-info-form',
        'kind', 'form',
        'formType', 'default',
        'title', '页面信息',
        'initialValues', '{}'::jsonb,
        'schema', page_info_schema
      )
    );
  end if;

  next_schema := jsonb_set(
    coalesce(edit_page.schema, '{}'::jsonb),
    '{blocks}',
    next_blocks,
    true
  );
  -- The visual designer prefers schema.visualEditor when it exists. Remove the
  -- stale form snapshot so the runtime form above is converted back into a
  -- fresh visual block with the same fields and form-designer model.
  next_schema := next_schema - 'visualEditor';
  next_version := edit_page.version + 1;

  update public.lowcode_pages
  set
    page_type = 'edit',
    schema = next_schema,
    version = next_version,
    published_at = timezone('utc'::text, now())
  where id = edit_page.id;

  update public.lowcode_pages
  set edit_page_id = edit_page.id
  where id = list_page.id
    and edit_page_id is distinct from edit_page.id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (edit_page.id, next_version, next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end;
$migration$;

do $validation$
declare
  editor_form_schema jsonb;
begin
  select form_block->'schema'
  into editor_form_schema
  from public.lowcode_pages list_page
  join public.lowcode_pages edit_page on edit_page.id = list_page.edit_page_id
  cross join lateral jsonb_array_elements(coalesce(edit_page.schema->'blocks', '[]'::jsonb)) form_block
  where list_page.code = 'lowcode-pages'
    and form_block->>'kind' = 'form'
  limit 1;

  if editor_form_schema is null
    or jsonb_typeof(editor_form_schema->'fields') <> 'array'
    or not (editor_form_schema->'fields' @> '[{"field":"title"}]'::jsonb)
    or not (editor_form_schema->'fields' @> '[{"field":"tableName"}]'::jsonb)
    or not (editor_form_schema->'fields' @> '[{"field":"relateConfig"}]'::jsonb)
  then
    raise exception 'Low-code page management edit form migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
