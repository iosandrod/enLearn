-- Bind the node-action edit form to its node-owned data source.

begin;

do $migration$
declare
  edit_page public.lowcode_pages%rowtype;
  visual_props jsonb;
  node_source jsonb;
  next_blocks jsonb;
  next_visual_blocks jsonb;
  next_schema jsonb;
  next_version integer;
begin
  select *
  into edit_page
  from public.lowcode_pages
  where code = 'lowcode_function-edit'
  limit 1;

  if edit_page.id is null then
    return;
  end if;

  select block.value->'props'
  into visual_props
  from jsonb_array_elements(
    coalesce(edit_page.schema->'visualEditor'->'pages'->'/'->'blocks', '[]'::jsonb)
  ) as block(value)
  where block.value->'props'->>'blockId' = 'edit-form'
  limit 1;

  if visual_props is null then
    return;
  end if;

  node_source := jsonb_strip_nulls(jsonb_build_object(
    'key', 'edit-form',
    'label', coalesce(nullif(visual_props->>'title', ''), 'edit-form'),
    'sourceType', case
      when coalesce(nullif(visual_props->>'tableName', ''), nullif(visual_props->'postDataJson'->>'tableName', '')) is not null
        then 'table'
      else null
    end,
    'serviceName', coalesce(nullif(visual_props->>'serviceName', ''), 'admin'),
    'serviceMethod', coalesce(nullif(visual_props->>'serviceMethod', ''), nullif(visual_props->>'saveMethod', '')),
    'saveMethod', nullif(visual_props->>'saveMethod', ''),
    'entityCode', nullif(visual_props->>'entityCode', ''),
    'tableName', coalesce(nullif(visual_props->>'tableName', ''), nullif(visual_props->'postDataJson'->>'tableName', '')),
    'postData', case
      when jsonb_typeof(visual_props->'postDataJson') = 'object' then visual_props->'postDataJson'
      else '{}'::jsonb
    end,
    'autoLoad', true
  ));

  select coalesce(jsonb_agg(
    case
      when block.value->>'kind' = 'form' and block.value->>'id' = 'edit-form' then
        (block.value - 'sourceKey' - 'submitSourceKey') || jsonb_build_object('dataSource', node_source)
      else block.value
    end
    order by block.ordinality
  ), '[]'::jsonb)
  into next_blocks
  from jsonb_array_elements(coalesce(edit_page.schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality);

  select coalesce(jsonb_agg(
    case
      when block.value->'props'->>'blockId' = 'edit-form' then
        block.value || jsonb_build_object(
          'props',
          ((block.value->'props') - 'sourceKey' - 'submitSourceKey') || jsonb_build_object('dataSource', node_source)
        )
      else block.value
    end
    order by block.ordinality
  ), '[]'::jsonb)
  into next_visual_blocks
  from jsonb_array_elements(
    coalesce(edit_page.schema->'visualEditor'->'pages'->'/'->'blocks', '[]'::jsonb)
  ) with ordinality as block(value, ordinality);

  next_schema := jsonb_set(edit_page.schema, '{blocks}', next_blocks, true);
  next_schema := jsonb_set(next_schema, '{visualEditor,pages,/,blocks}', next_visual_blocks, true);

  if next_schema is not distinct from edit_page.schema then
    return;
  end if;

  next_version := edit_page.version + 1;

  update public.lowcode_pages
  set
    schema = next_schema,
    version = next_version,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  where id = edit_page.id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (edit_page.id, next_version, next_schema, timezone('utc'::text, now()))
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end;
$migration$;

update public.lowcode_node_actions
set
  source_code = replace(
    source_code,
    'const sourceKey = readString(block.sourceKey, readString(block.submitSourceKey, block.id));',
    'const sourceKey = readString(block.id);'
  ),
  updated_at = timezone('utc'::text, now())
where node_type = 'form'
  and action_code = 'loadData'
  and source_code like '%block.sourceKey%block.submitSourceKey%';

select pg_notify('pgrst', 'reload schema');

commit;
