-- Normalize the first printDetail format (a field array) into the sub-table format.
-- New definitions already using sub-table objects are left unchanged.
with legacy_details as (
  select
    definitions.id,
    jsonb_build_array(
      jsonb_build_object(
        'id', 'detail',
        'field', 'detail',
        'label', '明细',
        'columns', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'field', detail_field ->> 'field',
                'title', coalesce(detail_field ->> 'label', detail_field ->> 'field'),
                'width', case
                  when (detail_field #>> '{props,width}') ~ '^[0-9]+(\\.[0-9]+)?$'
                    then (detail_field #>> '{props,width}')::numeric
                  else 100
                end
              )
              order by detail_field ->> 'field'
            )
            from jsonb_array_elements(definitions.schema -> 'printDetail') as detail_fields(detail_field)
          ),
          '[]'::jsonb
        )
      )
    ) as tables
  from public.lowcode_form_definitions definitions
  where definitions.enabled = true
    and definitions.code like 'print-designer.datasource.%'
    and jsonb_typeof(definitions.schema -> 'printDetail') = 'array'
    and jsonb_array_length(definitions.schema -> 'printDetail') > 0
    and jsonb_typeof((definitions.schema -> 'printDetail') -> 0) = 'object'
    and not ((definitions.schema -> 'printDetail') -> 0 ? 'columns')
)
update public.lowcode_form_definitions definitions
set schema = jsonb_set(definitions.schema, '{printDetail}', legacy_details.tables, true),
    updated_at = timezone('utc', now())
from legacy_details
where definitions.id = legacy_details.id;
