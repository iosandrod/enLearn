update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field_item->>'field' <> 'relateInfoConfig' then field_item
        else jsonb_set(
          field_item,
          '{props,schema,fields}',
          (
            select jsonb_agg(
              case
                when relation_field->>'field' in (
                  'resource',
                  'valueField',
                  'displayField',
                  'displayValueField',
                  'searchField'
                ) then
                  jsonb_set(
                    jsonb_set(relation_field, '{component}', '"vxe-select"'::jsonb, true),
                    '{props}',
                    coalesce(relation_field->'props', '{}'::jsonb)
                      || jsonb_build_object(
                        'clearable', true,
                        'filterable', true,
                        'multiple', relation_field->>'field' = 'displayField'
                      ),
                    true
                  )
                when relation_field->>'field' = 'fieldMappings' then
                  jsonb_set(
                    relation_field,
                    '{props,columns}',
                    (
                      select jsonb_agg(
                        case
                          when mapping_column->>'field' in ('sourceField', 'targetField') then
                            jsonb_set(
                              jsonb_set(
                                mapping_column,
                                '{component}',
                                '"vxe-select"'::jsonb,
                                true
                              ),
                              '{props}',
                              coalesce(mapping_column->'props', '{}'::jsonb)
                                || jsonb_build_object('clearable', true, 'filterable', true),
                              true
                            )
                          else mapping_column
                        end
                        order by mapping_ordinality
                      )
                      from jsonb_array_elements(relation_field#>'{props,columns}')
                        with ordinality as mapping_columns(mapping_column, mapping_ordinality)
                    ),
                    true
                  )
                else relation_field
              end
              order by relation_ordinality
            )
            from jsonb_array_elements(field_item#>'{props,schema,fields}')
              with ordinality as relation_fields(relation_field, relation_ordinality)
            where relation_field->>'field' in (
              'resource',
              'valueField',
              'displayField',
              'displayValueField',
              'searchField',
              'pageSize',
              'searchable',
              'fieldMappings'
            )
          ),
          true
        )
      end
      order by field_ordinality
    )
    from jsonb_array_elements(definitions.schema->'fields')
      with ordinality as definition_fields(field_item, field_ordinality)
  ),
  true
)
where definitions.code = 'runtime-form-field-editor'
  and jsonb_typeof(definitions.schema->'fields') = 'array';

do $verify$
declare
  v_relation_fields jsonb;
  v_mapping_columns jsonb;
begin
  select field_item#>'{props,schema,fields}'
  into v_relation_fields
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'relateInfoConfig';

  select relation_field#>'{props,columns}'
  into v_mapping_columns
  from jsonb_array_elements(v_relation_fields) relation_field
  where relation_field->>'field' = 'fieldMappings';

  if v_relation_fields is null
    or (
      select count(*)
      from jsonb_array_elements(v_relation_fields) relation_field
      where relation_field->>'field' in (
        'resource',
        'valueField',
        'displayField',
        'displayValueField',
        'searchField'
      )
        and relation_field->>'component' = 'vxe-select'
    ) <> 5
    or exists (
      select 1
      from jsonb_array_elements(v_relation_fields) relation_field
      where relation_field->>'field' in (
        'sourceType',
        'entityCode',
        'tableName',
        'pageCode',
        'sourceKey',
        'serviceName',
        'serviceMethod'
      )
    )
    or coalesce((
      select (relation_field#>>'{props,multiple}')::boolean
      from jsonb_array_elements(v_relation_fields) relation_field
      where relation_field->>'field' = 'displayField'
    ), false) is not true
    or (
      select count(*)
      from jsonb_array_elements(v_mapping_columns) mapping_column
      where mapping_column->>'field' in ('sourceField', 'targetField')
        and mapping_column->>'component' = 'vxe-select'
    ) <> 2 then
    raise exception 'Runtime relation selector schema verification failed.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
