-- Let picker material properties configure both static options and an option-source code.

begin;

create or replace function pg_temp.patch_picker_option_source_property(value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_schema jsonb := value;
  v_code_field jsonb := jsonb_build_object(
    'field', '__lowcodeOptionsCode',
    'target', 'props',
    'path', '__lowcodeOptionsCode',
    'label', U&'\4E0B\62C9\6570\636E\6E90 Code',
    'component', 'vxe-select',
    'valueKind', 'string',
    'defaultValue', '',
    'optionsCode', 'option_source_code',
    'props', jsonb_build_object(
      'clearable', true,
      'filterable', true,
      'allowCreate', true,
      'placeholder', U&'\8BF7\9009\62E9\6216\8F93\5165\4E0B\62C9 Code'
    )
  );
  v_fields jsonb;
  v_tabs jsonb;
begin
  if value is null then
    return value;
  end if;

  select coalesce(jsonb_agg(entry.item order by entry.ordinal), '[]'::jsonb)
  into v_fields
  from (
    select v_code_field as item, fields.ordinal * 10 - 1 as ordinal
    from jsonb_array_elements(coalesce(v_schema->'fields', '[]'::jsonb))
      with ordinality fields(field_item, ordinal)
    where fields.field_item->>'field' = 'columns'

    union all

    select
      case
        when fields.field_item->>'field' = 'columns' then
          fields.field_item || jsonb_build_object(
            'label', U&'\4E0B\62C9\9009\9879\8868',
            'props',
            coalesce(fields.field_item->'props', '{}'::jsonb) || jsonb_build_object(
              'height', 180,
              'minHeight', 0
            )
          )
        else fields.field_item
      end as item,
      fields.ordinal * 10 as ordinal
    from jsonb_array_elements(coalesce(v_schema->'fields', '[]'::jsonb))
      with ordinality fields(field_item, ordinal)
    where fields.field_item->>'field' <> '__lowcodeOptionsCode'
  ) entry;

  v_schema := jsonb_set(v_schema, '{fields}', v_fields, true);

  select coalesce(
    jsonb_agg(
      case
        when tabs.tab_item->>'key' = 'options' then
          tabs.tab_item || jsonb_build_object(
            'blocks',
            jsonb_build_array(
              jsonb_build_object('kind', 'field', 'field', '__lowcodeOptionsCode'),
              jsonb_build_object('kind', 'field', 'field', 'columns')
            )
          )
        else tabs.tab_item
      end
      order by tabs.ordinal
    ),
    '[]'::jsonb
  )
  into v_tabs
  from jsonb_array_elements(coalesce(v_schema#>'{layout,0,tabs}', '[]'::jsonb))
    with ordinality tabs(tab_item, ordinal);

  v_schema := jsonb_set(v_schema, '{layout,0,tabs}', v_tabs, true);

  return v_schema;
end;
$function$;

update public.lowcode_form_definitions definitions
set schema = pg_temp.patch_picker_option_source_property(definitions.schema)
where definitions.code = 'material-prop.picker';

do $validation$
declare
  v_source_count integer;
  v_code_field_count integer;
  v_code_field jsonb;
  v_columns_field jsonb;
  v_option_blocks text[];
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'option_source_code'
    and source_type = 'view'
    and status = 'active';

  select count(*)::integer
  into v_code_field_count
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'material-prop.picker'
    and field_item->>'field' = '__lowcodeOptionsCode';

  select field_item
  into v_code_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'material-prop.picker'
    and field_item->>'field' = '__lowcodeOptionsCode'
  limit 1;

  select field_item
  into v_columns_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'material-prop.picker'
    and field_item->>'field' = 'columns';

  select array_agg(block_item->>'field' order by blocks.ordinal)
  into v_option_blocks
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema#>'{layout,0,tabs}') tabs(tab_item),
    lateral jsonb_array_elements(tabs.tab_item->'blocks') with ordinality blocks(block_item, ordinal)
  where definitions.code = 'material-prop.picker'
    and tabs.tab_item->>'key' = 'options';

  if v_source_count <> 1
    or v_code_field_count <> 1
    or v_code_field->>'target' <> 'props'
    or v_code_field->>'path' <> '__lowcodeOptionsCode'
    or v_code_field->>'component' <> 'vxe-select'
    or v_code_field->>'valueKind' <> 'string'
    or v_code_field->>'optionsCode' <> 'option_source_code'
    or v_code_field#>>'{props,filterable}' <> 'true'
    or v_code_field#>>'{props,allowCreate}' <> 'true'
    or v_columns_field->>'label' <> U&'\4E0B\62C9\9009\9879\8868'
    or v_columns_field#>>'{props,height}' <> '180'
    or v_columns_field#>>'{props,minHeight}' <> '0'
    or v_option_blocks <> array['__lowcodeOptionsCode', 'columns']::text[]
  then
    raise exception 'Picker option-source code property validation failed: source %, field %, columns %, blocks %.',
      v_source_count, v_code_field, v_columns_field, v_option_blocks;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
