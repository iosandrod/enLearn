-- Add a database-backed component selector to the runtime field editor.

begin;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  cache_ttl_seconds,
  status,
  sort_order,
  is_system
) values (
  'form_field_component_type',
  U&'\8868\5355\5B57\6BB5\7EC4\4EF6\7C7B\578B',
  U&'\8FD0\884C\65F6\8868\5355\5B57\6BB5\53EF\7528\7684\7EC4\4EF6\7C7B\578B\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  55,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values
  ('form_field_component_type', U&'\8F93\5165\6846',      'vxe-input',          'active', 10,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\591A\884C\6587\672C', 'vxe-textarea',       'active', 20,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\4E0B\62C9\9009\62E9', 'vxe-select',         'active', 30,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\5F00\5173',            'vxe-switch',         'active', 40,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\5BC6\7801\8F93\5165\6846', 'vxe-password-input', 'active', 50, true, '{}'::jsonb),
  ('form_field_component_type', U&'\590D\9009\6846\7EC4', 'vxe-checkbox-group', 'active', 60,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\5355\9009\6846\7EC4', 'vxe-radio-group',    'active', 70,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\6811\5F62\9009\62E9', 'vxe-tree-select',    'active', 80,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\7EA7\8054\9009\62E9', 'lc-cascader',        'active', 90,  true, '{}'::jsonb),
  ('form_field_component_type', U&'\6570\5B57\8F93\5165', 'lc-number-input',    'active', 100, true, '{}'::jsonb),
  ('form_field_component_type', U&'\989C\8272\9009\62E9', 'lc-color-picker',    'active', 110, true, '{}'::jsonb),
  ('form_field_component_type', U&'\9009\9879\9009\62E9', 'lc-option-select',   'active', 120, true, '{}'::jsonb),
  ('form_field_component_type', 'JSON ' || U&'\7F16\8F91\5668', 'lc-json-editor',   'active', 130, true, '{}'::jsonb),
  ('form_field_component_type', U&'\4EE3\7801\7F16\8F91\5668', 'lc-monaco-editor', 'active', 140, true, '{}'::jsonb),
  ('form_field_component_type', U&'\5173\8054\8D44\6599', 'base-info',          'active', 150, true, '{}'::jsonb),
  ('form_field_component_type', U&'\6570\7EC4\8868\683C', 'lc-array-table',     'active', 160, true, '{}'::jsonb),
  ('form_field_component_type', U&'\5B50\8868\5355',       'lc-sub-form',        'active', 170, true, '{}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'form_field_component_type'
  and value not in (
    'vxe-input',
    'vxe-textarea',
    'vxe-select',
    'vxe-switch',
    'vxe-password-input',
    'vxe-checkbox-group',
    'vxe-radio-group',
    'vxe-tree-select',
    'lc-cascader',
    'lc-number-input',
    'lc-color-picker',
    'lc-option-select',
    'lc-json-editor',
    'lc-monaco-editor',
    'base-info',
    'lc-array-table',
    'lc-sub-form'
  );

update public.lowcode_form_definitions definitions
set description = U&'\7F16\8F91\5355\4E2A\8FD0\884C\65F6\8868\5355\5B57\6BB5\7684\7EC4\4EF6\3001\5FC5\5F55\3001\6A21\5F0F\7981\7528\3001\9ED8\8BA4\503C\3001\4E0B\62C9\7F16\7801\3001\66F4\65B0\4E8B\4EF6\548C\6821\9A8C\51FD\6570\3002',
    schema = jsonb_set(
      definitions.schema,
      '{fields}',
      (
        select jsonb_agg(field_item order by sort_key)
        from (
          select field_item, ordinal * 2 as sort_key
          from jsonb_array_elements(definitions.schema->'fields')
            with ordinality fields(field_item, ordinal)
          where field_item->>'field' <> 'component'

          union all

          select jsonb_build_object(
            'field', 'component',
            'label', U&'\7EC4\4EF6\7C7B\578B',
            'component', 'vxe-select',
            'optionsCode', 'form_field_component_type',
            'props', jsonb_build_object(
              'clearable', false,
              'filterable', true,
              'placeholder', U&'\8BF7\9009\62E9\7EC4\4EF6\7C7B\578B'
            ),
            'rules', jsonb_build_array(jsonb_build_object(
              'required', true,
              'message', U&'\8BF7\9009\62E9\7EC4\4EF6\7C7B\578B'
            ))
          ), coalesce(
            (
              select ordinal * 2 - 1
              from jsonb_array_elements(definitions.schema->'fields')
                with ordinality existing_fields(existing_field, ordinal)
              where existing_field->>'field' = 'required'
              limit 1
            ),
            5
          )
        ) ordered_fields
      ),
      true
    )
where definitions.code = 'runtime-form-field-editor';

do $validation$
declare
  v_source_count integer;
  v_option_count integer;
  v_field jsonb;
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'form_field_component_type'
    and source_type = 'dict'
    and status = 'active';

  select count(*)::integer
  into v_option_count
  from public.system_option_items
  where source_code = 'form_field_component_type'
    and status = 'active';

  select field_item
  into v_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'component';

  if v_source_count <> 1
    or v_option_count <> 17
    or v_field->>'component' <> 'vxe-select'
    or v_field->>'optionsCode' <> 'form_field_component_type'
    or v_field#>>'{props,filterable}' <> 'true'
    or v_field#>>'{props,clearable}' <> 'false'
  then
    raise exception 'Runtime field component selector validation failed: source %, options %, field %.',
      v_source_count, v_option_count, v_field;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
