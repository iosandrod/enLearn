-- Database-backed edit renderer choices for the grid column designer.

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
  'grid_column_edit_type',
  U&'\8868\683C\5217\7F16\8F91\7C7B\578B',
  U&'\4F4E\4EE3\7801\8868\683C\5217\8BBE\8BA1\5668\53EF\7528\7684 VxeGrid \7F16\8F91\6E32\67D3\5668\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  50,
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
  ('grid_column_edit_type', U&'\4E0D\542F\7528', '',                  'active', 10, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\6587\672C\8F93\5165', 'VxeInput',           'active', 20, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\6570\5B57\8F93\5165', 'VxeNumberInput',     'active', 30, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\65E5\671F\9009\62E9', 'VxeDatePicker',      'active', 40, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\4E0B\62C9\9009\62E9', 'VxeSelect',          'active', 50, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\5F00\5173', 'VxeSwitch',                     'active', 60, true, '{}'::jsonb),
  ('grid_column_edit_type', U&'\591A\884C\6587\672C', 'VxeTextarea',        'active', 70, true, '{}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'grid_column_edit_type'
  and value not in (
    '',
    'VxeInput',
    'VxeNumberInput',
    'VxeDatePicker',
    'VxeSelect',
    'VxeSwitch',
    'VxeTextarea'
  );

do $validation$
declare
  v_option_count integer;
  v_active_option_count integer;
begin
  select
    count(*),
    count(*) filter (where status = 'active')
  into v_option_count, v_active_option_count
  from public.system_option_items
  where source_code = 'grid_column_edit_type';

  if v_option_count <> 7 or v_active_option_count <> 7 then
    raise exception 'Grid column edit type dropdown validation failed: options %, active options %.',
      v_option_count, v_active_option_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
