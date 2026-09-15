-- All newly-created process instances are executed by the canonical Trigger
-- workflow runner. The legacy instance task is no longer a submission target.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'workflow_runtime_command'
    and p.pronargs = 2;

  if v_definition is null then
    raise exception 'workflow_runtime_command function was not found.';
  end if;

  v_definition := replace(
    v_definition,
    '''workflow.instance.run''',
    '''workflow.trigger-workflow.run'''
  );

  execute v_definition;
end;
$$;
