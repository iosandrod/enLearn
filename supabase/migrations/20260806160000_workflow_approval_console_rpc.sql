-- Approval console read model. Complex cross-table aggregation and auth.users
-- access stay in PostgreSQL and are exposed only to the service role.

create or replace function public.workflow_approval_console_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, basejump
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_account_id uuid := nullif(v_payload->>'account_id', '')::uuid;
  v_instance_id uuid;
  v_limit integer;
  v_offset integer;
  v_result jsonb;
  v_rows jsonb;
  v_summary jsonb;
  v_definitions jsonb;
  v_total integer;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'workflow_approval_console_command payload must be an object.'
      using errcode = '22023';
  end if;
  if v_account_id is null then
    raise exception 'account_id is required.' using errcode = '22023';
  end if;

  if v_action = 'list' then
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit', '')::integer, 100), 1), 200);
    v_offset := least(greatest(coalesce(nullif(v_payload->>'offset', '')::integer, 0), 0), 100000);

    with filtered as (
      select
        instances.*,
        definitions.code as definition_code,
        definitions.name as definition_name,
        profiles.full_name as initiator_name,
        profiles.nickname as initiator_nickname,
        auth_users.email::text as initiator_email,
        coalesce(node_stats.node_count, 0)::integer as node_count,
        coalesce(node_stats.completed_node_count, 0)::integer as completed_node_count,
        coalesce(node_stats.current_node_names, '{}'::text[]) as current_node_names,
        coalesce(task_stats.task_count, 0)::integer as task_count,
        coalesce(task_stats.active_task_count, 0)::integer as active_task_count
      from public.wf_process_instance instances
      join public.wf_process_definition definitions on definitions.id = instances.definition_id
      left join public.users profiles on profiles.id = instances.initiator_id
      left join auth.users auth_users on auth_users.id = instances.initiator_id
      left join lateral (
        select
          count(*) as node_count,
          count(*) filter (where nodes.status = 'completed') as completed_node_count,
          array_agg(distinct nodes.name) filter (
            where nodes.status in ('running', 'waiting')
          ) as current_node_names
        from public.wf_node_instance nodes
        where nodes.process_instance_id = instances.id
      ) node_stats on true
      left join lateral (
        select
          count(*) as task_count,
          count(*) filter (where tasks.status in ('pending', 'claimed')) as active_task_count
        from public.wf_task tasks
        where tasks.process_instance_id = instances.id
      ) task_stats on true
      where instances.account_id = v_account_id
        and (
          nullif(v_payload->>'status', '') is null
          or instances.status = v_payload->>'status'
        )
        and (
          nullif(v_payload->>'definition_id', '') is null
          or instances.definition_id = (v_payload->>'definition_id')::uuid
        )
        and (
          nullif(v_payload->>'initiator_id', '') is null
          or instances.initiator_id = (v_payload->>'initiator_id')::uuid
        )
        and (
          nullif(v_payload->>'started_from', '') is null
          or instances.started_at >= (v_payload->>'started_from')::timestamptz
        )
        and (
          nullif(v_payload->>'started_to', '') is null
          or instances.started_at < (v_payload->>'started_to')::timestamptz
        )
        and (
          nullif(v_payload->>'search', '') is null
          or instances.title ilike '%' || (v_payload->>'search') || '%'
          or instances.business_key ilike '%' || (v_payload->>'search') || '%'
          or coalesce(instances.document_id, '') ilike '%' || (v_payload->>'search') || '%'
          or definitions.name ilike '%' || (v_payload->>'search') || '%'
          or definitions.code ilike '%' || (v_payload->>'search') || '%'
          or coalesce(profiles.full_name, '') ilike '%' || (v_payload->>'search') || '%'
          or coalesce(auth_users.email::text, '') ilike '%' || (v_payload->>'search') || '%'
        )
    ), paged as (
      select *
      from filtered
      order by started_at desc
      limit v_limit offset v_offset
    )
    select
      coalesce((select jsonb_agg(to_jsonb(paged) order by paged.started_at desc) from paged), '[]'::jsonb),
      (select count(*)::integer from filtered)
    into v_rows, v_total;

    select jsonb_build_object(
      'total', count(*)::integer,
      'running', count(*) filter (where status = 'running')::integer,
      'approved', count(*) filter (where status = 'approved')::integer,
      'rejected', count(*) filter (where status = 'rejected')::integer,
      'canceled', count(*) filter (where status = 'canceled')::integer,
      'terminated', count(*) filter (where status = 'terminated')::integer,
      'failed', count(*) filter (where status = 'failed')::integer
    )
    into v_summary
    from public.wf_process_instance
    where account_id = v_account_id;

    select coalesce(jsonb_agg(to_jsonb(definition_rows) order by definition_rows.name, definition_rows.version desc), '[]'::jsonb)
    into v_definitions
    from (
      select id, code, name, version, status
      from public.wf_process_definition
      where account_id = v_account_id
      order by name, version desc
    ) definition_rows;

    return jsonb_build_object(
      'rows', v_rows,
      'total', v_total,
      'limit', v_limit,
      'offset', v_offset,
      'summary', v_summary,
      'definitions', v_definitions
    );
  end if;

  if v_action = 'detail_support' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    if not exists (
      select 1
      from public.wf_process_instance
      where id = v_instance_id
        and account_id = v_account_id
    ) then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'candidates', coalesce((
        select jsonb_agg(to_jsonb(candidate_rows) order by candidate_rows.task_created_at, candidate_rows.id)
        from (
          select candidates.*, tasks.created_at as task_created_at
          from public.wf_task_candidate candidates
          join public.wf_task tasks on tasks.id = candidates.task_id
          where tasks.process_instance_id = v_instance_id
            and tasks.account_id = v_account_id
        ) candidate_rows
      ), '[]'::jsonb),
      'users', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', memberships.user_id,
          'name', coalesce(
            nullif(btrim(profiles.full_name), ''),
            nullif(btrim(profiles.nickname), ''),
            nullif(split_part(coalesce(auth_users.email::text, ''), '@', 1), ''),
            memberships.user_id::text
          ),
          'email', coalesce(auth_users.email::text, '')
        ) order by coalesce(profiles.full_name, auth_users.email::text, memberships.user_id::text))
        from basejump.account_user memberships
        left join public.users profiles on profiles.id = memberships.user_id
        left join auth.users auth_users on auth_users.id = memberships.user_id
        where memberships.account_id = v_account_id
          and (
            jsonb_typeof(v_payload->'user_ids') <> 'array'
            or memberships.user_id::text in (
              select value from jsonb_array_elements_text(v_payload->'user_ids')
            )
          )
      ), '[]'::jsonb)
    );
  end if;

  raise exception 'Unsupported workflow approval console action: %.', coalesce(p_action, '')
    using errcode = '22023';
end;
$function$;

revoke all on function public.workflow_approval_console_command(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.workflow_approval_console_command(text, jsonb)
  to service_role;
