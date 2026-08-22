-- System dropdown source for planning console scenario versions.

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
  'planning_console_scenario',
  U&'\6392\4EA7\573A\666F',
  U&'\6392\4EA7\63A7\5236\53F0\573A\666F\4E0B\62C9\FF0C\5305\542B\6B63\5F0F\7248\3001\6D4B\8BD5\7248\3001\PMC\7248\672C\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  70,
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
  (
    'planning_console_scenario',
    U&'\6B63\5F0F\7248',
    'official',
    'active',
    10,
    true,
    '{}'::jsonb
  ),
  (
    'planning_console_scenario',
    U&'\6D4B\8BD5\7248',
    'test',
    'active',
    20,
    true,
    '{}'::jsonb
  ),
  (
    'planning_console_scenario',
    U&'PMC\7248\672C',
    'pmc',
    'active',
    30,
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

delete from public.system_option_items
where source_code = 'planning_console_scenario'
  and value not in ('official', 'test', 'pmc');

do $validation$
declare
  v_option_count integer;
  v_active_option_count integer;
  v_values text[];
begin
  select
    count(*),
    count(*) filter (where status = 'active'),
    array_agg(value order by sort_order)
  into v_option_count, v_active_option_count, v_values
  from public.system_option_items
  where source_code = 'planning_console_scenario';

  if v_option_count <> 3
    or v_active_option_count <> 3
    or v_values <> array['official', 'test', 'pmc']::text[]
  then
    raise exception 'Planning console scenario dropdown validation failed: options %, active options %, values %.',
      v_option_count, v_active_option_count, v_values;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
