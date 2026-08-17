-- Expose the primary table association in the database-backed page information form.

begin;

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{fields}',
  case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(schema->'fields', '[]'::jsonb)) field
      where field->>'field' = 'tableName'
    ) then (
      select jsonb_agg(
        case
          when field_item->>'field' = 'tableName' then '{
            "field": "tableName",
            "label": "关联表名",
            "component": "vxe-select",
            "optionsCode": "physical_table_name",
            "props": {
              "filterable": true,
              "clearable": true,
              "placeholder": "请选择关联表"
            },
            "span": 2
          }'::jsonb
          else field_item
        end
        order by ordinal
      )
      from jsonb_array_elements(coalesce(schema->'fields', '[]'::jsonb)) with ordinality fields(field_item, ordinal)
    )
    else jsonb_insert(
      coalesce(schema->'fields', '[]'::jsonb),
      '{2}',
      '{
        "field": "tableName",
        "label": "关联表名",
        "component": "vxe-select",
        "optionsCode": "physical_table_name",
        "props": {
          "filterable": true,
          "clearable": true,
          "placeholder": "请选择关联表"
        },
        "span": 2
      }'::jsonb,
      true
    )
  end,
  true
)
where code = 'page-info-design';

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{layout,0,tabs,0,blocks}',
  jsonb_insert(
    coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb),
    '{1}',
    '{"kind": "field", "field": "tableName"}'::jsonb,
    true
  ),
  true
)
where code = 'page-info-design'
  and not (
    coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
      @> '[{"kind": "field", "field": "tableName"}]'::jsonb
  );

do $validation$
declare
  page_info_schema jsonb;
  table_name_field jsonb;
begin
  select schema
  into page_info_schema
  from public.lowcode_form_definitions
  where code = 'page-info-design'
  limit 1;

  select field
  into table_name_field
  from jsonb_array_elements(coalesce(page_info_schema->'fields', '[]'::jsonb)) field
  where field->>'field' = 'tableName'
  limit 1;

  if page_info_schema is null
    or coalesce(table_name_field->>'label', '') <> '关联表名'
    or coalesce(table_name_field->>'component', '') <> 'vxe-select'
    or coalesce(table_name_field->>'optionsCode', '') <> 'physical_table_name'
    or not (
      coalesce(page_info_schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
        @> '[{"kind": "field", "field": "tableName"}]'::jsonb
    )
  then
    raise exception 'Page information table-name form migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
