-- Trigger workflow models use webhook/schedule as their persisted start node
-- type. Treat those event nodes as starts when publishing a runtime definition.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'publish_workflow_model'
    and p.pronargs = 4;

  if v_definition is null then
    raise exception 'publish_workflow_model function was not found.';
  end if;

  v_definition := replace(
    v_definition,
    'if v_node_type = ''start'' then v_start_count := v_start_count + 1; end if;',
    'if v_node_type in (''start'', ''webhook'', ''schedule'') then v_start_count := v_start_count + 1; end if;'
  );

  execute v_definition;
end;
$$;
