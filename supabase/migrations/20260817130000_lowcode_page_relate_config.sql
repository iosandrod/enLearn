-- Add page-level category relation metadata and expose it in page information design.

begin;

alter table public.lowcode_pages
  add column if not exists relate_config jsonb not null default '{}'::jsonb;

comment on column public.lowcode_pages.relate_config is
  'Category relation configuration for the low-code page.';

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{fields}',
  (
    select coalesce(jsonb_agg(field_item order by ordinal), '[]'::jsonb)
      || jsonb_build_array($field$
        {
          "field": "relateConfig",
          "label": "关联配置",
          "component": "lc-sub-form",
          "span": 2,
          "props": {
            "columns": 2,
            "padding": false,
            "schema": {
              "columns": 2,
              "fields": [
                {
                  "field": "category",
                  "label": "类别",
                  "component": "vxe-input",
                  "props": { "clearable": true, "placeholder": "请输入页面类别" }
                },
                {
                  "field": "parentCategory",
                  "label": "上级类别",
                  "component": "vxe-input",
                  "props": { "clearable": true, "placeholder": "请输入上级类别" }
                },
                {
                  "field": "relatedPageCode",
                  "label": "关联页面编码",
                  "component": "vxe-input",
                  "span": 2,
                  "props": { "clearable": true, "placeholder": "请输入关联的低代码页面编码" }
                }
              ],
              "actions": []
            }
          }
        }
      $field$::jsonb)
    from jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb))
      with ordinality fields(field_item, ordinal)
    where field_item->>'field' <> 'relateConfig'
  ),
  true
)
where definitions.code = 'page-info-design';

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{layout,0,tabs,0,blocks}',
  coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
    || jsonb_build_array('{"kind":"field","field":"relateConfig"}'::jsonb),
  true
)
where code = 'page-info-design'
  and not (
    coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
      @> '[{"kind":"field","field":"relateConfig"}]'::jsonb
  );

do $validation$
declare
  page_info_schema jsonb;
  relate_config_field jsonb;
begin
  select schema
  into page_info_schema
  from public.lowcode_form_definitions
  where code = 'page-info-design'
  limit 1;

  select field
  into relate_config_field
  from jsonb_array_elements(coalesce(page_info_schema->'fields', '[]'::jsonb)) field
  where field->>'field' = 'relateConfig'
  limit 1;

  if page_info_schema is null
    or coalesce(relate_config_field->>'component', '') <> 'lc-sub-form'
    or jsonb_typeof(relate_config_field #> '{props,schema,fields}') <> 'array'
    or jsonb_typeof(relate_config_field #> '{props,schema,actions}') <> 'array'
    or not (coalesce(relate_config_field #> '{props,schema,fields}', '[]'::jsonb) @> '[{"field":"category"}]'::jsonb)
    or not (coalesce(relate_config_field #> '{props,schema,fields}', '[]'::jsonb) @> '[{"field":"parentCategory"}]'::jsonb)
    or not (coalesce(relate_config_field #> '{props,schema,fields}', '[]'::jsonb) @> '[{"field":"relatedPageCode"}]'::jsonb)
    or not (
      coalesce(page_info_schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
        @> '[{"kind":"field","field":"relateConfig"}]'::jsonb
    )
  then
    raise exception 'Page relation configuration migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
