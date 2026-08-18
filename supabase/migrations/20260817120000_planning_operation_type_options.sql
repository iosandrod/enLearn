-- Reusable operation type choices for planning operation forms and grids.

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
  'planning_operation_type',
  U&'\5DE5\5E8F\7C7B\578B',
  U&'\6392\4EA7\8BA1\5212\4E2D\7684\5236\9020\5DE5\5E8F\3001\5DE5\827A\8DEF\7EBF\3001\5907\9009\4E0E\62C6\5206\7C7B\578B\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  60,
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
    'planning_operation_type',
    U&'\56FA\5B9A\65F6\957F\5DE5\5E8F',
    'fixed_time',
    'active',
    10,
    true,
    jsonb_build_object('description', U&'\5DE5\5E8F\65F6\957F\57FA\672C\4E0D\968F\751F\4EA7\6570\91CF\53D8\5316\3002')
  ),
  (
    'planning_operation_type',
    U&'\6309\6570\91CF\8BA1\65F6\5DE5\5E8F',
    'time_per',
    'active',
    20,
    true,
    jsonb_build_object('description', U&'\5DE5\5E8F\65F6\957F\7531\56FA\5B9A\51C6\5907\65F6\95F4\548C\5355\4F4D\52A0\5DE5\65F6\95F4\7EC4\6210\3002')
  ),
  (
    'planning_operation_type',
    U&'\5DE5\827A\8DEF\7EBF',
    'routing',
    'active',
    30,
    true,
    jsonb_build_object('description', U&'\5C06\591A\9053\5B50\5DE5\5E8F\7EC4\7EC7\4E3A\4E00\6761\5B8C\6574\751F\4EA7\8DEF\7EBF\3002')
  ),
  (
    'planning_operation_type',
    U&'\5907\9009\5DE5\827A',
    'alternate',
    'active',
    40,
    true,
    jsonb_build_object('description', U&'\591A\79CD\751F\4EA7\65B9\6848\4E2D\9009\62E9\4E00\79CD\6267\884C\3002')
  ),
  (
    'planning_operation_type',
    U&'\62C6\5206\5DE5\827A',
    'split',
    'active',
    50,
    true,
    jsonb_build_object('description', U&'\5C06\751F\4EA7\4EFB\52A1\5206\914D\7ED9\591A\4E2A\5B50\5DE5\5E8F\6267\884C\3002')
  )
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'planning_operation_type'
  and value not in ('fixed_time', 'time_per', 'routing', 'alternate', 'split');

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
  where source_code = 'planning_operation_type';

  if v_option_count <> 5
    or v_active_option_count <> 5
    or v_values <> array['fixed_time', 'time_per', 'routing', 'alternate', 'split']::text[]
  then
    raise exception 'Planning operation type dropdown validation failed: options %, active options %, values %.',
      v_option_count, v_active_option_count, v_values;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
