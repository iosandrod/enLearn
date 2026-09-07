-- Canonicalize every nested form to field.props.schema.

create temp table lowcode_sub_form_documents (
  source text not null,
  record_id uuid not null,
  document jsonb not null,
  primary key (source, record_id)
) on commit drop;

insert into lowcode_sub_form_documents (source, record_id, document)
select 'lowcode_pages', id, schema from public.lowcode_pages
union all
select 'lowcode_form_definitions', id, schema from public.lowcode_form_definitions;

do $$
declare
  current_depth integer;
  changed_rows integer;
begin
  loop
    with recursive walk(source, record_id, path, value, depth) as (
      select source, record_id, array[]::text[], document, 0
      from lowcode_sub_form_documents
      union all
      select walk.source, walk.record_id, walk.path || child.key, child.value, walk.depth + 1
      from walk
      cross join lateral (
        select key, value
        from jsonb_each(
          case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
        )
        union all
        select (ordinality - 1)::text, value
        from jsonb_array_elements(
          case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
        ) with ordinality
      ) as child
    )
    select max(depth)
    into current_depth
    from walk
    where value ->> 'component' = 'lc-sub-form'
      and (
        jsonb_typeof(value -> 'props') is distinct from 'object'
        or value -> 'props' ?| array['fields', 'columns', 'layout', 'actions']
        or jsonb_typeof(value -> 'props' -> 'schema') is distinct from 'object'
        or jsonb_typeof(value -> 'props' -> 'schema' -> 'fields') is distinct from 'array'
        or jsonb_typeof(value -> 'props' -> 'schema' -> 'actions') is distinct from 'array'
      );

    exit when current_depth is null;

    with recursive walk(source, record_id, path, value, depth) as (
      select source, record_id, array[]::text[], document, 0
      from lowcode_sub_form_documents
      union all
      select walk.source, walk.record_id, walk.path || child.key, child.value, walk.depth + 1
      from walk
      cross join lateral (
        select key, value
        from jsonb_each(
          case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
        )
        union all
        select (ordinality - 1)::text, value
        from jsonb_array_elements(
          case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
        ) with ordinality
      ) as child
    ), targets as (
      select
        source,
        record_id,
        path,
        value,
        case
          when jsonb_typeof(value -> 'props') = 'object' then value -> 'props'
          else '{}'::jsonb
        end as props
      from walk
      where depth = current_depth
        and value ->> 'component' = 'lc-sub-form'
        and (
          jsonb_typeof(value -> 'props') is distinct from 'object'
          or value -> 'props' ?| array['fields', 'columns', 'layout', 'actions']
          or jsonb_typeof(value -> 'props' -> 'schema') is distinct from 'object'
          or jsonb_typeof(value -> 'props' -> 'schema' -> 'fields') is distinct from 'array'
          or jsonb_typeof(value -> 'props' -> 'schema' -> 'actions') is distinct from 'array'
        )
    ), replacements as (
      select
        source,
        record_id,
        path,
        jsonb_set(
          value,
          '{props}',
          jsonb_set(
            props - 'fields' - 'columns' - 'layout' - 'actions',
            '{schema}',
            (
              case
                when jsonb_typeof(props -> 'schema') = 'object' then props -> 'schema'
                else '{}'::jsonb
              end
              || case
                when jsonb_typeof(props -> 'schema' -> 'fields') = 'array' then '{}'::jsonb
                else jsonb_build_object(
                  'fields',
                  case
                    when jsonb_typeof(props -> 'fields') = 'array' then props -> 'fields'
                    else '[]'::jsonb
                  end
                )
              end
              || case
                when jsonb_typeof(props -> 'schema' -> 'actions') = 'array' then '{}'::jsonb
                else jsonb_build_object(
                  'actions',
                  case
                    when jsonb_typeof(props -> 'actions') = 'array' then props -> 'actions'
                    else '[]'::jsonb
                  end
                )
              end
              || case
                when props -> 'schema' ? 'layout' or jsonb_typeof(props -> 'layout') <> 'array'
                  then '{}'::jsonb
                else jsonb_build_object('layout', props -> 'layout')
              end
              || case
                when props -> 'schema' ? 'columns' or jsonb_typeof(props -> 'columns') <> 'number'
                  then '{}'::jsonb
                else jsonb_build_object('columns', props -> 'columns')
              end
            ),
            true
          ),
          true
        ) as value
      from targets
    ), target as (
      select source, record_id, path, value
      from replacements
      order by source, record_id, path::text
      limit 1
    )
    update lowcode_sub_form_documents as document
    set document = jsonb_set(document.document, target.path, target.value, true)
    from target
    where document.source = target.source
      and document.record_id = target.record_id;

    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      raise exception 'lc-sub-form canonicalization made no progress at depth %', current_depth;
    end if;
  end loop;
end;
$$;

create temp table changed_lowcode_pages on commit drop as
select
  page.id,
  document.document as schema
from public.lowcode_pages as page
join lowcode_sub_form_documents as document
  on document.source = 'lowcode_pages'
  and document.record_id = page.id
where page.schema is distinct from document.document;

update public.lowcode_pages as page
set
  schema = changed.schema,
  version = page.version + 1,
  published_at = case
    when page.status = 'published' then timezone('utc'::text, now())
    else page.published_at
  end,
  updated_at = timezone('utc'::text, now())
from changed_lowcode_pages as changed
where page.id = changed.id;

insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  page.id,
  page.version,
  page.schema,
  case
    when page.status = 'published' then page.published_at
    else null
  end
from public.lowcode_pages as page
join changed_lowcode_pages as changed on changed.id = page.id
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_form_definitions as definition
set schema = document.document
from lowcode_sub_form_documents as document
where document.source = 'lowcode_form_definitions'
  and document.record_id = definition.id
  and definition.schema is distinct from document.document;

do $$
declare
  legacy_count bigint;
  invalid_count bigint;
begin
  with recursive roots(value) as (
    select schema from public.lowcode_pages
    union all
    select schema from public.lowcode_form_definitions
  ), walk(value) as (
    select value from roots
    union all
    select child.value
    from walk
    cross join lateral (
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
      )
      union all
      select value
      from jsonb_each(
        case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
      )
    ) as child
  )
  select
    count(*) filter (
      where value ->> 'component' = 'lc-sub-form'
        and jsonb_typeof(value -> 'props') = 'object'
        and value -> 'props' ?| array['fields', 'columns', 'layout', 'actions']
    ),
    count(*) filter (
      where value ->> 'component' = 'lc-sub-form'
        and not (
          jsonb_typeof(value -> 'props' -> 'schema') is not distinct from 'object'
          and jsonb_typeof(value -> 'props' -> 'schema' -> 'fields') is not distinct from 'array'
          and jsonb_typeof(value -> 'props' -> 'schema' -> 'actions') is not distinct from 'array'
        )
    )
  into legacy_count, invalid_count
  from walk;

  if legacy_count <> 0 or invalid_count <> 0 then
    raise exception
      'lc-sub-form canonicalization failed: % legacy structures, % invalid schemas',
      legacy_count,
      invalid_count;
  end if;
end;
$$;

notify pgrst, 'reload schema';
