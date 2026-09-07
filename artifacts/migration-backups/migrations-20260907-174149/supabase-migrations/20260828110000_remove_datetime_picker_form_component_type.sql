begin;

delete from public.system_option_items
where source_code = 'form_input_component_type'
  and value = 'datetimePicker';

delete from public.lowcode_form_definitions
where code = 'material-prop.datetimepicker'
  or schema->>'componentKey' = 'datetimePicker';

do $validation$
begin
  if exists (
    select 1
    from public.system_option_items
    where source_code = 'form_input_component_type'
      and value = 'datetimePicker'
  ) then
    raise exception 'datetimePicker must not be available as a form input component type.';
  end if;

  if exists (
    select 1
    from public.lowcode_form_definitions
    where code = 'material-prop.datetimepicker'
      or schema->>'componentKey' = 'datetimePicker'
  ) then
    raise exception 'datetimePicker material property definition must be removed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
