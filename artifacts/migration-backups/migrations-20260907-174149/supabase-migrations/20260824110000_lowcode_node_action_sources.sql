-- Split executeAction method choices into one system dropdown source per node type.

begin;

delete from public.system_option_sources
where code = 'lowcode_node_action_method';

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
) values
  (
    'lowcode_node_action_form_method',
    U&'\4F4E\4EE3\7801\8868\5355\8282\70B9\53EF\6267\884C\4E8B\4EF6',
    U&'\8868\5355\8282\70B9\7684 executeAction \949E\5B50\53EF\9009\4E8B\4EF6\3002',
    'dict', '{}', 0, 'active', 57, true
  ),
  (
    'lowcode_node_action_search_form_method',
    U&'\4F4E\4EE3\7801\67E5\8BE2\8868\5355\8282\70B9\53EF\6267\884C\4E8B\4EF6',
    U&'\67E5\8BE2\8868\5355\8282\70B9\7684 executeAction \949E\5B50\53EF\9009\4E8B\4EF6\3002',
    'dict', '{}', 0, 'active', 58, true
  ),
  (
    'lowcode_node_action_grid_method',
    U&'\4F4E\4EE3\7801\8868\683C\8282\70B9\53EF\6267\884C\4E8B\4EF6',
    U&'\8868\683C\8282\70B9\7684 executeAction \949E\5B50\53EF\9009\4E8B\4EF6\3002',
    'dict', '{}', 0, 'active', 59, true
  ),
  (
    'lowcode_node_action_modal_method',
    U&'\4F4E\4EE3\7801\5F39\6846\8282\70B9\53EF\6267\884C\4E8B\4EF6',
    U&'\5F39\6846\8282\70B9\7684 executeAction \949E\5B50\53EF\9009\4E8B\4EF6\3002',
    'dict', '{}', 0, 'active', 60, true
  ),
  (
    'lowcode_node_action_drawer_method',
    U&'\4F4E\4EE3\7801\62BD\5C49\8282\70B9\53EF\6267\884C\4E8B\4EF6',
    U&'\62BD\5C49\8282\70B9\7684 executeAction \949E\5B50\53EF\9009\4E8B\4EF6\3002',
    'dict', '{}', 0, 'active', 61, true
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
where source_code in (
  'lowcode_node_action_form_method',
  'lowcode_node_action_search_form_method',
  'lowcode_node_action_grid_method',
  'lowcode_node_action_modal_method',
  'lowcode_node_action_drawer_method'
)
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
  ('lowcode_node_action_form_method', U&'\8BBE\7F6E\8868\5355\6570\636E', 'setData', 'active', 10, true, '{"nodeKind":"form"}'::jsonb),
  ('lowcode_node_action_form_method', U&'\6821\9A8C\8868\5355\6570\636E', 'validate', 'active', 20, true, '{"nodeKind":"form"}'::jsonb),
  ('lowcode_node_action_form_method', U&'\83B7\53D6\8868\5355\6570\636E', 'getData', 'active', 30, true, '{"nodeKind":"form"}'::jsonb),
  ('lowcode_node_action_form_method', U&'\5237\65B0\4E0B\62C9\6570\636E', 'refreshOptions', 'active', 40, true, '{"nodeKind":"form"}'::jsonb),
  ('lowcode_node_action_form_method', U&'\91CD\7F6E\8868\5355\6570\636E', 'resetData', 'active', 50, true, '{"nodeKind":"form"}'::jsonb),
  ('lowcode_node_action_search_form_method', U&'\8BBE\7F6E\67E5\8BE2\6761\4EF6', 'setData', 'active', 10, true, '{"nodeKind":"searchForm"}'::jsonb),
  ('lowcode_node_action_search_form_method', U&'\6821\9A8C\67E5\8BE2\6761\4EF6', 'validate', 'active', 20, true, '{"nodeKind":"searchForm"}'::jsonb),
  ('lowcode_node_action_search_form_method', U&'\83B7\53D6\67E5\8BE2\6570\636E', 'getData', 'active', 30, true, '{"nodeKind":"searchForm"}'::jsonb),
  ('lowcode_node_action_search_form_method', U&'\5237\65B0\67E5\8BE2\9009\9879', 'refreshOptions', 'active', 40, true, '{"nodeKind":"searchForm"}'::jsonb),
  ('lowcode_node_action_search_form_method', U&'\91CD\7F6E\67E5\8BE2\6761\4EF6', 'resetData', 'active', 50, true, '{"nodeKind":"searchForm"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\52A0\8F7D\6570\636E', 'loadData', 'active', 10, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\91CD\65B0\8F7D\5165\6570\636E', 'reloadData', 'active', 20, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\83B7\53D6\53D8\66F4\96C6', 'getChanges', 'active', 30, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\6821\9A8C\8868\683C', 'validate', 'active', 40, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\65B0\589E\884C', 'addRow', 'active', 50, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_grid_method', U&'\5220\9664\5F53\524D\884C', 'deleteCurrentRow', 'active', 60, true, '{"nodeKind":"grid"}'::jsonb),
  ('lowcode_node_action_modal_method', U&'\6253\5F00\5F39\6846', 'open', 'active', 10, true, '{"nodeKind":"modal"}'::jsonb),
  ('lowcode_node_action_drawer_method', U&'\6253\5F00\62BD\5C49', 'open', 'active', 10, true, '{"nodeKind":"drawer"}'::jsonb)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $validation$
declare
  v_source_count integer;
  v_option_count integer;
  v_old_source_count integer;
begin
  select count(*)::integer into v_source_count
  from public.system_option_sources
  where code in (
    'lowcode_node_action_form_method',
    'lowcode_node_action_search_form_method',
    'lowcode_node_action_grid_method',
    'lowcode_node_action_modal_method',
    'lowcode_node_action_drawer_method'
  ) and source_type = 'dict' and status = 'active';

  select count(*)::integer into v_option_count
  from public.system_option_items
  where source_code in (
    'lowcode_node_action_form_method',
    'lowcode_node_action_search_form_method',
    'lowcode_node_action_grid_method',
    'lowcode_node_action_modal_method',
    'lowcode_node_action_drawer_method'
  ) and status = 'active';

  select count(*)::integer into v_old_source_count
  from public.system_option_sources
  where code = 'lowcode_node_action_method';

  if v_source_count <> 5 or v_option_count <> 18 or v_old_source_count <> 0 then
    raise exception 'Low-code node action source split validation failed: sources %, options %, old source %.',
      v_source_count, v_option_count, v_old_source_count;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
