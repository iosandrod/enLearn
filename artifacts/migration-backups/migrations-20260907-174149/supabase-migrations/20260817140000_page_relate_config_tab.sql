-- Move page relation configuration into a dedicated page-information tab.

begin;

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{layout,0,tabs}',
  (
    select coalesce(jsonb_agg(tab_item order by ordinal), '[]'::jsonb)
      || jsonb_build_array(
        '{"key":"relations","label":"关联配置","blocks":[{"kind":"field","field":"relateConfig"}]}'::jsonb
      )
    from (
      select
        case
          when tab_item->>'key' = 'relations' then null
          else jsonb_set(
            tab_item,
            '{blocks}',
            (
              select coalesce(jsonb_agg(field_item order by field_ordinal), '[]'::jsonb)
              from jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
                with ordinality blocks(field_item, field_ordinal)
              where field_item->>'field' <> 'relateConfig'
            ),
            true
          )
        end as tab_item,
        ordinal
      from jsonb_array_elements(coalesce(definitions.schema #> '{layout,0,tabs}', '[]'::jsonb))
        with ordinality tabs(tab_item, ordinal)
    ) normalized_tabs
    where tab_item is not null
  ),
  true
)
where definitions.code = 'page-info-design';

do $validation$
declare
  page_info_schema jsonb;
  basic_tab jsonb;
  relations_tab jsonb;
  relations_tab_count integer;
begin
  select schema
  into page_info_schema
  from public.lowcode_form_definitions
  where code = 'page-info-design'
  limit 1;

  select tab_item
  into basic_tab
  from jsonb_array_elements(coalesce(page_info_schema #> '{layout,0,tabs}', '[]'::jsonb)) tab_item
  where tab_item->>'key' = 'basic'
  limit 1;

  select count(*)
  into relations_tab_count
  from jsonb_array_elements(coalesce(page_info_schema #> '{layout,0,tabs}', '[]'::jsonb)) tab_item
  where tab_item->>'key' = 'relations';

  select tab_item
  into relations_tab
  from jsonb_array_elements(coalesce(page_info_schema #> '{layout,0,tabs}', '[]'::jsonb)) tab_item
  where tab_item->>'key' = 'relations'
  limit 1;

  if page_info_schema is null
    or basic_tab is null
    or relations_tab_count <> 1
    or relations_tab->>'label' <> '关联配置'
    or coalesce(relations_tab->'blocks', '[]'::jsonb)
      <> '[{"kind":"field","field":"relateConfig"}]'::jsonb
    or basic_tab->'blocks' @> '[{"kind":"field","field":"relateConfig"}]'::jsonb
  then
    raise exception 'Page relation configuration tab migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
