-- Store print data-source detail field definitions alongside the header form
-- schema so the designer can edit the two areas independently.
with detail_fields as (
  select
    definitions.id,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'field', columns.column_definition ->> 'field',
        'label', coalesce(columns.column_definition ->> 'title', columns.column_definition ->> 'field'),
        'component', coalesce(columns.column_definition ->> 'component', 'vxe-input'),
        'props', coalesce(columns.column_definition -> 'props', '{}'::jsonb)
      ) order by columns.ordinal
    ), '[]'::jsonb) as fields
  from public.lowcode_form_definitions definitions
  cross join lateral jsonb_array_elements(definitions.schema -> 'fields') as fields(field_definition)
  cross join lateral jsonb_array_elements(
    coalesce(fields.field_definition #> '{props,columns}', '[]'::jsonb)
  ) with ordinality as columns(column_definition, ordinal)
  where definitions.enabled = true
    and definitions.code like 'print-designer.datasource.%'
    and fields.field_definition ->> 'field' = 'detail'
    and not (definitions.schema ? 'printDetail')
  group by definitions.id
)
update public.lowcode_form_definitions definitions
set schema = jsonb_set(definitions.schema, '{printDetail}', detail_fields.fields, true),
    updated_at = timezone('utc', now())
from detail_fields
where definitions.id = detail_fields.id;

comment on column public.lowcode_form_definitions.schema is
  'Low-code schema; print data-source definitions may include printDetail as an array of detail field definitions.';
