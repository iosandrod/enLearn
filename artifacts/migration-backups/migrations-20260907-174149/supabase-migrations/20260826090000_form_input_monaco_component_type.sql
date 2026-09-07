begin;

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values (
  'form_input_component_type',
  U&'\4EE3\7801\8F93\5165\6848',
  'lc-monaco-editor',
  'active',
  15,
  true,
  '{}'::jsonb
)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $validation$
declare
  v_option_count integer;
  v_code_editor_count integer;
begin
  select count(*)::integer
  into v_option_count
  from public.system_option_items
  where source_code = 'form_input_component_type'
    and status = 'active';

  select count(*)::integer
  into v_code_editor_count
  from public.system_option_items
  where source_code = 'form_input_component_type'
    and value = 'lc-monaco-editor'
    and status = 'active';

  if v_option_count <> 11 or v_code_editor_count <> 1 then
    raise exception 'Form input Monaco component validation failed: options %, code editor %. ',
      v_option_count, v_code_editor_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
