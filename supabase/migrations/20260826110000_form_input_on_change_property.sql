begin;

create or replace function pg_temp.patch_form_input_on_change(value jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_schema jsonb := value;
  v_field jsonb := jsonb_build_object(
    'field', 'onChange',
    'target', 'props',
    'path', 'onChange',
    'label', U&'\503C\53D8\5316\4E8B\4EF6',
    'component', 'lc-monaco-editor',
    'valueKind', 'string',
    'defaultValue', '',
    'props', jsonb_build_object(
      'dialog', true,
      'dialogTitle', U&'\7F16\8F91\503C\53D8\5316\4E8B\4EF6',
      'language', 'javascript',
      'theme', 'vs',
      'scriptThisType', 'LowCodeButtonScriptThis',
      'contextDrawer', true,
      'contextDrawerTitle', U&'\5F53\524D\9875\9762\4E0A\4E0B\6587',
      'editorHeight', 'min(500px, calc(100vh - 250px))',
      'editorOptions', jsonb_build_object(
        'wordWrap', 'on',
        'formatOnPaste', true,
        'formatOnType', true
      )
    )
  );
  v_tabs jsonb;
  v_has_events_tab boolean;
  v_fields jsonb;
begin
  if value is null or value->>'componentKey' is null then
    return value;
  end if;

  select coalesce(
    jsonb_agg(
      case
        when field_item.value->>'field' = 'onChange' then
          (v_field || field_item.value || jsonb_build_object(
            'target', 'props',
            'path', 'onChange',
            'component', 'lc-monaco-editor',
            'valueKind', 'string'
          )) || jsonb_build_object(
            'props', v_field->'props' || coalesce(field_item.value->'props', '{}'::jsonb)
          )
        else field_item.value
      end
      order by field_item.ordinality
    ),
    '[]'::jsonb
  )
  into v_fields
  from jsonb_array_elements(coalesce(v_schema->'fields', '[]'::jsonb))
    with ordinality field_item(value, ordinality);

  if not coalesce(v_schema->'fields', '[]'::jsonb) @> '[{"field":"onChange"}]'::jsonb then
    v_fields := v_fields || jsonb_build_array(v_field);
  end if;

  v_schema := jsonb_set(v_schema, '{fields}', v_fields, true);

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_schema#>'{layout,0,tabs}', '[]'::jsonb)) tab(value)
    where tab.value->>'key' = 'events'
  )
  into v_has_events_tab;

  if v_has_events_tab then
    select coalesce(
      jsonb_agg(
        case
          when tab.value->>'key' = 'events'
            and not coalesce(tab.value->'blocks', '[]'::jsonb)
              @> '[{"kind":"field","field":"onChange"}]'::jsonb then
            tab.value || jsonb_build_object(
              'blocks', coalesce(tab.value->'blocks', '[]'::jsonb) ||
                jsonb_build_array(jsonb_build_object('kind', 'field', 'field', 'onChange'))
            )
          else tab.value
        end
        order by tab.ordinality
      ),
      '[]'::jsonb
    )
    into v_tabs
    from jsonb_array_elements(coalesce(v_schema#>'{layout,0,tabs}', '[]'::jsonb))
      with ordinality tab(value, ordinality);
  else
    v_tabs := coalesce(v_schema#>'{layout,0,tabs}', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'key', 'events',
        'label', U&'\4E8B\4EF6',
        'blocks', jsonb_build_array(jsonb_build_object('kind', 'field', 'field', 'onChange'))
      )
    );
  end if;

  return jsonb_set(v_schema, '{layout,0,tabs}', v_tabs, true);
end;
$function$;

update public.lowcode_form_definitions definitions
set schema = pg_temp.patch_form_input_on_change(definitions.schema)
where definitions.schema->>'componentKey' in (
  'array-table',
  'checkbox',
  'datetimePicker',
  'input',
  'picker',
  'radio',
  'rate',
  'slider',
  'stepper',
  'sub-form',
  'switch'
);

do $validation$
begin
  if exists (
    select 1
    from public.lowcode_form_definitions definitions
    where definitions.schema->>'componentKey' in (
      'array-table',
      'checkbox',
      'datetimePicker',
      'input',
      'picker',
      'radio',
      'rate',
      'slider',
      'stepper',
      'sub-form',
      'switch'
    )
    and not coalesce(definitions.schema->'fields', '[]'::jsonb)
      @> '[{"field":"onChange","target":"props","path":"onChange","component":"lc-monaco-editor"}]'::jsonb
  ) then
    raise exception 'Form input onChange property migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
