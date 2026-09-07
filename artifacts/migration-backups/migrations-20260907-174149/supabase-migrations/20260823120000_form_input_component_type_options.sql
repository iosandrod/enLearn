-- Dropdown choices for visual form designer input component types.

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
  'form_input_component_type',
  U&'\8868\5355\8F93\5165\7EC4\4EF6\7C7B\578B',
  U&'\4F4E\4EE3\7801\8868\5355\8BBE\8BA1\5668\53EF\5207\6362\7684\753B\5E03\8F93\5165\7EC4\4EF6\7C7B\578B\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  56,
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
  ('form_input_component_type', U&'\8F93\5165\6846', 'input',          'active', 10,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\4E0B\62C9\9009\62E9', 'picker',    'active', 20,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\5F00\5173', 'switch',              'active', 30,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\590D\9009\6846\7EC4', 'checkbox',  'active', 40,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\5355\9009\6846\7EC4', 'radio',     'active', 50,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\6B65\8FDB\5668', 'stepper',        'active', 60,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\8BC4\5206', 'rate',                'active', 70,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\6ED1\5757', 'slider',              'active', 80,  true, '{}'::jsonb),
  ('form_input_component_type', U&'\8868\683C\8F93\5165', 'array-table', 'active', 90, true, '{}'::jsonb),
  ('form_input_component_type', U&'\5B50\8868\5355', 'sub-form',       'active', 100, true, '{}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'form_input_component_type'
  and value not in (
    'input',
    'picker',
    'switch',
    'checkbox',
    'radio',
    'stepper',
    'rate',
    'slider',
    'array-table',
    'sub-form'
  );

do $validation$
declare
  v_source_count integer;
  v_option_count integer;
  v_values text[];
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'form_input_component_type'
    and source_type = 'dict'
    and status = 'active';

  select count(*)::integer, array_agg(value order by sort_order)
  into v_option_count, v_values
  from public.system_option_items
  where source_code = 'form_input_component_type'
    and status = 'active';

  if v_source_count <> 1
    or v_option_count <> 10
    or v_values <> array[
      'input',
      'picker',
      'switch',
      'checkbox',
      'radio',
      'stepper',
      'rate',
      'slider',
      'array-table',
      'sub-form'
    ]::text[]
  then
    raise exception 'Form input component type dropdown validation failed: source %, options %, values %.',
      v_source_count, v_option_count, v_values;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
