-- MES business conflicts must not use PostgreSQL's retryable serialization
-- failure SQLSTATE. Keep the existing function signatures and replace only
-- explicit MES conflict raises, then refresh every version-dependent source.

begin;

do $migration$
declare
  routine record;
  definition text;
  rewritten text;
  patched_count integer := 0;
begin
  for routine in
    select procedure.oid as procedure_oid, procedure.proname
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'mes_complete_command',
        'mes_start_operation',
        'mes_report_production',
        'mes_issue_material',
        'mes_complete_operation',
        'mes_pause_operation',
        'mes_resume_operation',
        'mes_return_material',
        'mes_reverse_production',
        'mes_reverse_material'
      )
  loop
    definition := pg_catalog.pg_get_functiondef(routine.procedure_oid);
    rewritten := replace(
      definition,
      'using errcode = ''40001''',
      'using errcode = ''PT409'''
    );

    if rewritten = definition then
      if definition not like '%errcode = ''PT409''%' then
        raise exception 'Expected MES conflict SQLSTATE in function %.', routine.proname;
      end if;
    else
      execute rewritten;
    end if;

    patched_count := patched_count + 1;
  end loop;

  if patched_count <> 10 then
    raise exception 'Expected to patch 10 MES functions, patched %.', patched_count;
  end if;
end;
$migration$;

do $migration$
declare
  target_page_id uuid;
  page_schema jsonb;
  next_schema jsonb;
  next_version integer;
  next_published_at timestamptz;
  directive_path record;
  all_execution_sources constant jsonb :=
    '["workOrders","operations","components","productionTransactions","materialTransactions"]'::jsonb;
begin
  select page.id, page.schema
  into target_page_id, page_schema
  from public.lowcode_pages page
  where page.code = 'mes_execution_console'
  for update;

  if target_page_id is null then
    raise exception 'MES execution console page is missing.';
  end if;

  next_schema := page_schema;
  for directive_path in
    select array(
      select jsonb_array_elements_text(path.value)
    ) as value
    from jsonb_array_elements(
      '[
        ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","0","directives","1"],
        ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","1","directives","0","confirmDirectives","1"],
        ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","2","directives","1"],
        ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","3","directives","0","confirmDirectives","1"],
        ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","4","directives","1"],
        ["blocks","3","tabs","1","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"],
        ["blocks","3","tabs","1","blocks","0","schema","rowActions","actions","1","directives","0","confirmDirectives","1"],
        ["blocks","3","tabs","2","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"],
        ["blocks","3","tabs","3","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"]
      ]'::jsonb
    ) path
  loop
    if jsonb_extract_path(next_schema, variadic directive_path.value)->>'type'
         <> 'refreshDataSource' then
      raise exception 'MES refresh directive is missing at path %.', directive_path.value;
    end if;

    next_schema := jsonb_set(
      next_schema,
      directive_path.value || array['sourceKeys'],
      all_execution_sources,
      false
    );
  end loop;

  update public.lowcode_pages page
  set schema = next_schema,
      version = page.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where page.id = target_page_id
    and page.schema is distinct from next_schema
  returning page.version, page.published_at
  into next_version, next_published_at;

  if found then
    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    values (target_page_id, next_version, next_schema, next_published_at)
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end;
$migration$;

commit;
