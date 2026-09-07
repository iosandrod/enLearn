-- Add database-procedure defaults to the runtime field editor and runtime API.

begin;

create or replace function public.read_lowcode_default_value_procedure(
  p_action text,
  p_procedure text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_procedure text := btrim(coalesce(p_procedure, ''));
  v_parts text[];
  v_schema_name text;
  v_procedure_name text;
  v_oid oid;
  v_result jsonb;
begin
  if v_action = 'list' then
    if not (
      public.has_app_permission('lowcode.pages.manage')
      or public.has_app_permission('admin.entities.manage')
    ) then
      raise exception 'Low-code page permission required.' using errcode = '42501';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'value', routines.schema_name || '.' || routines.procedure_name,
          'label', routines.procedure_name || ' (' || routines.return_type || ')'
        )
        order by routines.schema_name, routines.procedure_name
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select
        namespaces.nspname as schema_name,
        procedures.proname as procedure_name,
        pg_catalog.format_type(procedures.prorettype, null) as return_type
      from pg_catalog.pg_proc procedures
      join pg_catalog.pg_namespace namespaces
        on namespaces.oid = procedures.pronamespace
      join pg_catalog.pg_type return_types
        on return_types.oid = procedures.prorettype
      where namespaces.nspname = 'public'
        and procedures.prokind = 'f'
        and procedures.pronargs = 0
        and procedures.proretset = false
        and procedures.prorettype <> 'pg_catalog.void'::pg_catalog.regtype
        and return_types.typtype <> 'p'
        and pg_catalog.has_function_privilege(current_user, procedures.oid, 'EXECUTE')
        and procedures.proname not in (
          'read_lowcode_default_value_procedure',
          'create_default_system_config',
          'handle_new_user'
        )
    ) routines;

    return v_result;
  end if;

  if v_action <> 'execute' then
    raise exception 'Unsupported default-value procedure action: %.', p_action
      using errcode = '22023';
  end if;

  v_parts := pg_catalog.parse_ident(v_procedure, true);
  if coalesce(array_length(v_parts, 1), 0) = 1 then
    v_schema_name := 'public';
    v_procedure_name := v_parts[1];
  elsif array_length(v_parts, 1) = 2 then
    v_schema_name := v_parts[1];
    v_procedure_name := v_parts[2];
  else
    raise exception 'Procedure name must be public.name.' using errcode = '22023';
  end if;

  if v_schema_name <> 'public' then
    raise exception 'Only public procedures can provide field default values.'
      using errcode = '42501';
  end if;

  select procedures.oid
  into v_oid
  from pg_catalog.pg_proc procedures
  join pg_catalog.pg_namespace namespaces
    on namespaces.oid = procedures.pronamespace
  join pg_catalog.pg_type return_types
    on return_types.oid = procedures.prorettype
  where namespaces.nspname = v_schema_name
    and procedures.proname = v_procedure_name
    and procedures.prokind = 'f'
    and procedures.pronargs = 0
    and procedures.proretset = false
    and procedures.prorettype <> 'pg_catalog.void'::pg_catalog.regtype
    and return_types.typtype <> 'p'
    and procedures.proname not in (
      'read_lowcode_default_value_procedure',
      'create_default_system_config',
      'handle_new_user'
    )
  order by procedures.oid
  limit 1;

  if v_oid is null then
    raise exception 'Default-value procedure "%" was not found.', v_procedure
      using errcode = 'P0002';
  end if;
  if not pg_catalog.has_function_privilege(current_user, v_oid, 'EXECUTE') then
    raise exception 'Execute permission is required for procedure "%".', v_procedure
      using errcode = '42501';
  end if;

  execute pg_catalog.format(
    'select pg_catalog.to_jsonb(%I.%I())',
    v_schema_name,
    v_procedure_name
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.read_lowcode_default_value_procedure(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_lowcode_default_value_procedure(text, text)
  to authenticated, service_role;

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{fields}',
  (
    select jsonb_agg(field_item order by ordinal)
    from (
      select
        case
          when field_value->>'field' = 'defaultValueType' then
            jsonb_set(
              field_value,
              '{options}',
              case
                when coalesce(
                  field_value->'options' @> '[{"value":"procedure"}]'::jsonb,
                  false
                ) then field_value->'options'
                else coalesce(field_value->'options', '[]'::jsonb) ||
                  jsonb_build_array(jsonb_build_object(
                    'label', U&'\5B58\50A8\8FC7\7A0B',
                    'value', 'procedure'
                  ))
              end,
              true
            )
          when field_value->>'field' = 'defaultValueScript' then
            jsonb_set(
              field_value,
              '{props}',
              coalesce(field_value->'props', '{}'::jsonb) || jsonb_build_object(
                'visibleWhen', jsonb_build_object(
                  'field', 'defaultValueType',
                  'equals', 'function'
                )
              ),
              true
            )
          else field_value
        end as field_item,
        ordinal * 2 as ordinal
      from jsonb_array_elements(definitions.schema->'fields')
        with ordinality fields(field_value, ordinal)

      union all

      select
        jsonb_build_object(
          'field', 'defaultValueProcedure',
          'label', U&'\5B58\50A8\8FC7\7A0B',
          'component', 'vxe-select',
          'span', 2,
          'props', jsonb_build_object(
            'clearable', true,
            'filterable', true,
            'placeholder', U&'\8BF7\9009\62E9\5B58\50A8\8FC7\7A0B',
            'visibleWhen', jsonb_build_object(
              'field', 'defaultValueType',
              'equals', 'procedure'
            )
          )
        ),
        coalesce((
          select min(script_ordinal * 2) - 1
          from jsonb_array_elements(definitions.schema->'fields')
            with ordinality scripts(script_value, script_ordinal)
          where script_value->>'field' = 'defaultValueScript'
        ), 1000000)
      where not coalesce(
        definitions.schema->'fields' @> '[{"field":"defaultValueProcedure"}]'::jsonb,
        false
      )
    ) updated_fields
  ),
  true
)
where definitions.code = 'runtime-form-field-editor';

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{layout}',
  (
    select jsonb_agg(
      case
        when root_node->>'kind' = 'tabs' then
          jsonb_set(
            root_node,
            '{tabs}',
            (
              select jsonb_agg(
                case
                  when tab->>'key' = 'default-options' and not coalesce(
                    tab->'blocks' @> '[{"kind":"field","field":"defaultValueProcedure"}]'::jsonb,
                    false
                  ) then jsonb_set(
                    tab,
                    '{blocks}',
                    coalesce(tab->'blocks', '[]'::jsonb) || jsonb_build_array(
                      jsonb_build_object('kind', 'field', 'field', 'defaultValueProcedure')
                    ),
                    true
                  )
                  else tab
                end
                order by tab_ordinal
              )
              from jsonb_array_elements(root_node->'tabs')
                with ordinality tabs(tab, tab_ordinal)
            ),
            true
          )
        else root_node
      end
      order by root_ordinal
    )
    from jsonb_array_elements(definitions.schema->'layout')
      with ordinality roots(root_node, root_ordinal)
  ),
  true
)
where definitions.code = 'runtime-form-field-editor';

do $validation$
declare
  v_field jsonb;
  v_type_field jsonb;
begin
  select field_item
  into v_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'defaultValueProcedure';

  select field_item
  into v_type_field
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'defaultValueType';

  if v_field->>'component' <> 'vxe-select'
    or v_field#>>'{props,filterable}' <> 'true'
    or v_field#>>'{props,visibleWhen,equals}' <> 'procedure'
    or not coalesce(v_type_field->'options' @> '[{"value":"procedure"}]'::jsonb, false)
  then
    raise exception 'Runtime form procedure-default validation failed: field %, type %.',
      v_field, v_type_field;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
