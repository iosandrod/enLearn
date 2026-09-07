-- Store executeAction method choices for the visual designer in the system dropdown registry.

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
  'lowcode_node_action_method',
  U&'\4F4E\4EE3\7801\8282\70B9\53EF\6267\884C\4E8B\4EF6',
  U&'\6309\4F4E\4EE3\7801\8282\70B9\7C7B\578B\63D0\4F9B executeAction \949E\5B50\53EF\9009\4E8B\4EF6\540D\79F0\3002',
  'dict',
  '{}'::jsonb,
  0,
  'active',
  57,
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

delete from public.system_option_items
where source_code = 'lowcode_node_action_method'
  and is_system = true;

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system,
  metadata
) values
  ('lowcode_node_action_method', U&'\8BBE\7F6E\8868\5355\6570\636E', 'form.setData',             'active', 10,  true, '{"nodeKind":"form","method":"setData"}'::jsonb),
  ('lowcode_node_action_method', U&'\6821\9A8C\8868\5355\6570\636E', 'form.validate',             'active', 20,  true, '{"nodeKind":"form","method":"validate"}'::jsonb),
  ('lowcode_node_action_method', U&'\83B7\53D6\8868\5355\6570\636E', 'form.getData',              'active', 30,  true, '{"nodeKind":"form","method":"getData"}'::jsonb),
  ('lowcode_node_action_method', U&'\5237\65B0\4E0B\62C9\6570\636E', 'form.refreshOptions',       'active', 40,  true, '{"nodeKind":"form","method":"refreshOptions"}'::jsonb),
  ('lowcode_node_action_method', U&'\91CD\7F6E\8868\5355\6570\636E', 'form.resetData',            'active', 50,  true, '{"nodeKind":"form","method":"resetData"}'::jsonb),
  ('lowcode_node_action_method', U&'\8BBE\7F6E\67E5\8BE2\6761\4EF6', 'searchForm.setData',        'active', 60,  true, '{"nodeKind":"searchForm","method":"setData"}'::jsonb),
  ('lowcode_node_action_method', U&'\6821\9A8C\67E5\8BE2\6761\4EF6', 'searchForm.validate',        'active', 70,  true, '{"nodeKind":"searchForm","method":"validate"}'::jsonb),
  ('lowcode_node_action_method', U&'\83B7\53D6\67E5\8BE2\6570\636E', 'searchForm.getData',         'active', 80,  true, '{"nodeKind":"searchForm","method":"getData"}'::jsonb),
  ('lowcode_node_action_method', U&'\5237\65B0\67E5\8BE2\9009\9879', 'searchForm.refreshOptions',  'active', 90,  true, '{"nodeKind":"searchForm","method":"refreshOptions"}'::jsonb),
  ('lowcode_node_action_method', U&'\91CD\7F6E\67E5\8BE2\6761\4EF6', 'searchForm.resetData',       'active', 100, true, '{"nodeKind":"searchForm","method":"resetData"}'::jsonb),
  ('lowcode_node_action_method', U&'\52A0\8F7D\6570\636E',       'grid.loadData',              'active', 110, true, '{"nodeKind":"grid","method":"loadData"}'::jsonb),
  ('lowcode_node_action_method', U&'\91CD\65B0\8F7D\5165\6570\636E', 'grid.reloadData',         'active', 120, true, '{"nodeKind":"grid","method":"reloadData"}'::jsonb),
  ('lowcode_node_action_method', U&'\83B7\53D6\53D8\66F4\96C6',    'grid.getChanges',           'active', 130, true, '{"nodeKind":"grid","method":"getChanges"}'::jsonb),
  ('lowcode_node_action_method', U&'\6821\9A8C\8868\683C',       'grid.validate',              'active', 140, true, '{"nodeKind":"grid","method":"validate"}'::jsonb),
  ('lowcode_node_action_method', U&'\65B0\589E\884C',             'grid.addRow',                'active', 150, true, '{"nodeKind":"grid","method":"addRow"}'::jsonb),
  ('lowcode_node_action_method', U&'\5220\9664\5F53\524D\884C',   'grid.deleteCurrentRow',      'active', 160, true, '{"nodeKind":"grid","method":"deleteCurrentRow"}'::jsonb),
  ('lowcode_node_action_method', U&'\6253\5F00\5F39\6846',         'modal.open',                'active', 170, true, '{"nodeKind":"modal","method":"open"}'::jsonb),
  ('lowcode_node_action_method', U&'\6253\5F00\62BD\5C49',         'drawer.open',               'active', 180, true, '{"nodeKind":"drawer","method":"open"}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

delete from public.system_option_items
where source_code = 'lowcode_node_action_method'
  and is_system = true
  and not (
    (metadata->>'nodeKind') in ('form', 'searchForm', 'grid', 'modal', 'drawer')
  );

do $validation$
declare
  v_source_count integer;
  v_option_count integer;
  v_node_kinds integer;
begin
  select count(*)::integer
  into v_source_count
  from public.system_option_sources
  where code = 'lowcode_node_action_method'
    and source_type = 'dict'
    and status = 'active';

  select count(*)::integer
  into v_option_count
  from public.system_option_items
  where source_code = 'lowcode_node_action_method'
    and status = 'active';

  select count(distinct metadata->>'nodeKind')::integer
  into v_node_kinds
  from public.system_option_items
  where source_code = 'lowcode_node_action_method'
    and status = 'active';

  if v_source_count <> 1 or v_option_count <> 18 or v_node_kinds <> 5 then
    raise exception 'Low-code node action dropdown validation failed: source %, options %, node kinds %.',
      v_source_count, v_option_count, v_node_kinds;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
