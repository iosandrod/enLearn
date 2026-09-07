-- Workflow runtime persistence boundary.
--
-- Runtime state transitions are intentionally implemented in PostgreSQL: the
-- task/instance locks, projections, history entries, variables, comments and
-- document bindings must commit together. API and Trigger.dev workers invoke
-- the service-role-only workflow_runtime_command RPC instead of opening a pg
-- connection themselves.

create or replace function public.workflow_runtime_infer_variable_type(p_value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select case jsonb_typeof(p_value)
    when 'number' then 'number'
    when 'boolean' then 'boolean'
    when 'string' then 'string'
    else 'json'
  end
$function$;

create or replace function public.workflow_runtime_upsert_variables(
  p_instance_id uuid,
  p_values jsonb,
  p_types jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_value jsonb;
begin
  if p_values is null then
    return;
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Workflow variables must be an object.' using errcode = '22023';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_values)
  loop
    insert into public.wf_variable (process_instance_id, key, value, value_type)
    values (
      p_instance_id,
      v_key,
      v_value,
      coalesce(
        nullif(p_types->>v_key, ''),
        public.workflow_runtime_infer_variable_type(v_value)
      )
    )
    on conflict (process_instance_id, key) do update set
      value = excluded.value,
      value_type = excluded.value_type,
      updated_at = timezone('utc'::text, now());
  end loop;
end;
$function$;

create or replace function public.workflow_runtime_insert_history(
  p_account_id uuid,
  p_instance_id uuid,
  p_event_type text,
  p_operator_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
begin
  insert into public.wf_history_event (
    account_id,
    process_instance_id,
    event_type,
    operator_id,
    payload,
    idempotency_key
  ) values (
    p_account_id,
    p_instance_id,
    p_event_type,
    p_operator_id,
    coalesce(p_payload, '{}'::jsonb),
    nullif(p_idempotency_key, '')
  )
  on conflict (process_instance_id, idempotency_key)
  where idempotency_key is not null
  do nothing;
end;
$function$;

create or replace function public.workflow_runtime_insert_comment(
  p_account_id uuid,
  p_instance_id uuid,
  p_task_id uuid,
  p_node_id text,
  p_action text,
  p_operator_id uuid,
  p_comment text
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if nullif(btrim(coalesce(p_comment, '')), '') is null then
    return;
  end if;

  insert into public.wf_comment (
    account_id,
    process_instance_id,
    task_id,
    node_id,
    action,
    operator_id,
    comment
  ) values (
    p_account_id,
    p_instance_id,
    p_task_id,
    p_node_id,
    p_action,
    p_operator_id,
    p_comment
  );
end;
$function$;

create or replace function public.workflow_runtime_assert_account_users(
  p_account_id uuid,
  p_user_ids jsonb
)
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, basejump
as $function$
declare
  v_user_id text;
  v_unique_ids uuid[] := array[]::uuid[];
  v_missing integer;
begin
  if p_user_ids is null then
    return;
  end if;
  if jsonb_typeof(p_user_ids) <> 'array' then
    raise exception 'Workflow user IDs must be an array.' using errcode = '22023';
  end if;

  for v_user_id in select value from jsonb_array_elements_text(p_user_ids)
  loop
    v_user_id := nullif(btrim(v_user_id), '');
    if v_user_id is null then
      continue;
    end if;
    if v_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Workflow users and account set must use valid UUIDs.' using errcode = '22023';
    end if;
    if not (v_user_id::uuid = any(v_unique_ids)) then
      v_unique_ids := array_append(v_unique_ids, v_user_id::uuid);
    end if;
  end loop;

  if coalesce(array_length(v_unique_ids, 1), 0) = 0 then
    return;
  end if;

  select count(*)::integer
  into v_missing
  from unnest(v_unique_ids) requested(user_id)
  where not exists (
    select 1
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.account_id = p_account_id
      and memberships.user_id = requested.user_id
      and accounts.status = 'active'
  );

  if v_missing > 0 then
    raise exception 'Every workflow user must belong to the active account set.'
      using errcode = '22023';
  end if;
end;
$function$;

create or replace function public.workflow_runtime_task_json(p_task_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select to_jsonb(tasks) || jsonb_build_object(
    'candidates', coalesce((
      select jsonb_agg(to_jsonb(candidates) order by candidates.id)
      from public.wf_task_candidate candidates
      where candidates.task_id = tasks.id
    ), '[]'::jsonb)
  )
  from public.wf_task tasks
  where tasks.id = p_task_id
$function$;

create or replace function public.workflow_runtime_instance_json(p_instance_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select to_jsonb(instances) || jsonb_build_object(
    'variables', coalesce((
      select jsonb_agg(to_jsonb(variables) order by variables.key)
      from public.wf_variable variables
      where variables.process_instance_id = instances.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(comments) order by comments.created_at)
      from public.wf_comment comments
      where comments.process_instance_id = instances.id
    ), '[]'::jsonb),
    'cc_items', coalesce((
      select jsonb_agg(to_jsonb(cc_items) order by cc_items.created_at)
      from public.wf_cc cc_items
      where cc_items.process_instance_id = instances.id
    ), '[]'::jsonb),
    'node_instances', coalesce((
      select jsonb_agg(to_jsonb(nodes) order by nodes.started_at nulls last, nodes.id)
      from public.wf_node_instance nodes
      where nodes.process_instance_id = instances.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(tasks) order by tasks.created_at, tasks.id)
      from public.wf_task tasks
      where tasks.process_instance_id = instances.id
    ), '[]'::jsonb)
  )
  from public.wf_process_instance instances
  where instances.id = p_instance_id
$function$;

create or replace function public.workflow_runtime_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, basejump
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_account_id uuid;
  v_user_id uuid;
  v_target_user_id uuid;
  v_instance_id uuid;
  v_task_id uuid;
  v_node_instance_id uuid;
  v_instance public.wf_process_instance%rowtype;
  v_task public.wf_task%rowtype;
  v_node public.wf_node_instance%rowtype;
  v_candidate public.wf_task_candidate%rowtype;
  v_cc public.wf_cc%rowtype;
  v_item jsonb;
  v_candidate_item jsonb;
  v_candidates jsonb;
  v_variables jsonb;
  v_variable_types jsonb;
  v_user_ids jsonb;
  v_result jsonb;
  v_decision jsonb;
  v_status text;
  v_event_type text;
  v_comment text;
  v_message text;
  v_limit integer;
  v_is_visible boolean;
  v_can_operate boolean;
  v_now timestamp with time zone := timezone('utc'::text, now());
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'workflow_runtime_command payload must be an object.' using errcode = '22023';
  end if;

  if v_action = 'create_instance' then
    v_instance_id := nullif(v_payload->>'id', '')::uuid;
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    if v_instance_id is null or v_account_id is null then
      raise exception 'id and account_id are required.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.wf_process_instance
      where account_id = v_account_id
        and business_key = v_payload->>'business_key'
        and status = 'running'
    ) then
      raise exception 'A running workflow instance already exists for this business key.'
        using errcode = '22023';
    end if;

    begin
      insert into public.wf_process_instance (
        id,
        account_id,
        definition_id,
        definition_version,
        business_key,
        document_type,
        document_id,
        title,
        status,
        initiator_id,
        trigger_task_id
      ) values (
        v_instance_id,
        v_account_id,
        nullif(v_payload->>'definition_id', '')::uuid,
        (v_payload->>'definition_version')::integer,
        nullif(btrim(v_payload->>'business_key'), ''),
        nullif(btrim(v_payload->>'document_type'), ''),
        nullif(btrim(v_payload->>'document_id'), ''),
        nullif(btrim(v_payload->>'title'), ''),
        'running',
        nullif(v_payload->>'initiator_id', '')::uuid,
        'workflow.instance.run'
      )
      returning * into v_instance;
    exception when unique_violation then
      raise exception 'A running workflow instance already exists for this business key.'
        using errcode = '22023';
    end;

    v_variables := coalesce(v_payload->'variables', '{}'::jsonb);
    v_variable_types := coalesce(v_payload->'variable_types', '{}'::jsonb);
    perform public.workflow_runtime_upsert_variables(
      v_instance.id,
      v_variables,
      v_variable_types
    );

    if nullif(btrim(v_payload->>'document_type'), '') is not null
       and nullif(btrim(v_payload->>'document_id'), '') is not null then
      insert into public.wf_document_binding (
        account_id,
        document_type,
        document_id,
        process_instance_id,
        status
      ) values (
        v_account_id,
        btrim(v_payload->>'document_type'),
        btrim(v_payload->>'document_id'),
        v_instance.id,
        'running'
      )
      on conflict (account_id, document_type, document_id, process_instance_id)
      do update set status = excluded.status;
    end if;

    perform public.workflow_runtime_insert_history(
      v_account_id,
      v_instance.id,
      'PROCESS_STARTED',
      nullif(v_payload->>'initiator_id', '')::uuid,
      jsonb_build_object(
        'definitionId', v_payload->'definition_id',
        'businessKey', v_payload->'business_key',
        'documentType', v_payload->'document_type',
        'documentId', v_payload->'document_id'
      ),
      'process:' || v_instance.id::text || ':started'
    );
    return to_jsonb(v_instance);
  end if;

  if v_action = 'set_trigger_run' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    update public.wf_process_instance
    set trigger_run_id = nullif(btrim(v_payload->>'trigger_run_id'), '')
    where id = v_instance_id;
    return null;
  end if;

  if v_action = 'delete_unstarted_instance' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    delete from public.wf_process_instance
    where id = v_instance_id
      and trigger_run_id is null;
    return null;
  end if;

  if v_action = 'list_instances' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit', '')::integer, 200), 1), 200);
    select coalesce(jsonb_agg(to_jsonb(instance_rows) order by instance_rows.started_at desc), '[]'::jsonb)
    into v_result
    from (
      select instances.*
      from public.wf_process_instance instances
      where (v_account_id is null or instances.account_id = v_account_id)
        and (
          nullif(btrim(v_payload->>'status'), '') is null
          or instances.status = btrim(v_payload->>'status')
        )
        and (
          nullif(btrim(v_payload->>'document_type'), '') is null
          or instances.document_type = btrim(v_payload->>'document_type')
        )
        and (
          nullif(btrim(v_payload->>'document_id'), '') is null
          or instances.document_id = btrim(v_payload->>'document_id')
        )
        and (
          nullif(v_payload->>'initiator_id', '') is null
          or instances.initiator_id = (v_payload->>'initiator_id')::uuid
        )
      order by instances.started_at desc
      limit v_limit
    ) instance_rows;
    return v_result;
  end if;

  if v_action = 'get_instance' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    v_result := public.workflow_runtime_instance_json(v_instance_id);
    if v_result is null then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;
    return v_result;
  end if;

  if v_action in ('list_tasks', 'list_todo_tasks', 'list_done_tasks') then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_user_id := nullif(v_payload->>'user_id', '')::uuid;
    select coalesce(jsonb_agg(to_jsonb(task_rows) order by task_rows.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select tasks.*
      from public.wf_task tasks
      where (v_account_id is null or tasks.account_id = v_account_id)
        and (
          nullif(v_payload->>'assignee_id', '') is null
          or tasks.assignee_id = (v_payload->>'assignee_id')::uuid
        )
        and (
          case
            when v_action = 'list_todo_tasks' then tasks.status in ('pending', 'claimed')
            when v_action = 'list_done_tasks' then tasks.status = coalesce(nullif(v_payload->>'status', ''), 'completed')
            else nullif(v_payload->>'status', '') is null or tasks.status = v_payload->>'status'
          end
        )
        and (
          v_action = 'list_tasks'
          or v_user_id is null
          or tasks.assignee_id = v_user_id
          or exists (
            select 1
            from public.wf_task_candidate candidates
            where candidates.task_id = tasks.id
              and (
                candidates.candidate_type <> 'user'
                or candidates.candidate_id = v_user_id::text
              )
          )
        )
      order by tasks.created_at desc
      limit 200
    ) task_rows;
    return v_result;
  end if;

  if v_action = 'list_cc' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_user_id := nullif(v_payload->>'user_id', '')::uuid;
    select coalesce(jsonb_agg(to_jsonb(cc_rows) order by cc_rows.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select cc_items.*
      from public.wf_cc cc_items
      where cc_items.account_id = v_account_id
        and (
          v_user_id is null
          or cc_items.recipient_id = v_user_id
          or cc_items.candidate_id = v_user_id::text
          or cc_items.candidate_type <> 'user'
        )
      order by cc_items.created_at desc
      limit 200
    ) cc_rows;
    return v_result;
  end if;

  if v_action = 'get_task' then
    v_task_id := nullif(v_payload->>'task_id', '')::uuid;
    v_result := public.workflow_runtime_task_json(v_task_id);
    if v_result is null then
      raise exception 'Workflow task not found.' using errcode = 'P0002';
    end if;
    return v_result;
  end if;

  if v_action = 'get_timeline' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    if not exists (select 1 from public.wf_process_instance where id = v_instance_id) then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;
    select coalesce(jsonb_agg(to_jsonb(history_rows) order by history_rows.created_at), '[]'::jsonb)
    into v_result
    from (
      select history.*
      from public.wf_history_event history
      where history.process_instance_id = v_instance_id
      order by history.created_at
    ) history_rows;
    return v_result;
  end if;

  if v_action in ('prepare_task_decision', 'claim_task', 'transfer_task', 'add_sign_task') then
    v_task_id := nullif(coalesce(v_payload->>'task_id', v_payload->>'source_task_id'), '')::uuid;
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_user_id := nullif(v_payload->>'user_id', '')::uuid;

    select * into v_task
    from public.wf_task
    where id = v_task_id
    for update;
    if not found then
      raise exception 'Workflow task not found.' using errcode = 'P0002';
    end if;

    select * into v_instance
    from public.wf_process_instance
    where id = v_task.process_instance_id
    for update;
    if not found then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;

    select coalesce(jsonb_agg(to_jsonb(candidates)), '[]'::jsonb)
    into v_candidates
    from public.wf_task_candidate candidates
    where candidates.task_id = v_task.id;

    if v_action = 'prepare_task_decision'
       and v_task.status = 'completed'
       and v_task.decision_payload->>'action' = v_payload->>'decision_action' then
      if nullif(v_task.waitpoint_token_id, '') is null then
        raise exception 'Workflow task is not bound to a Trigger.dev waitpoint.' using errcode = '22023';
      end if;
      return jsonb_build_object(
        'task', to_jsonb(v_task),
        'instance', to_jsonb(v_instance),
        'token_id', v_task.waitpoint_token_id,
        'decision', v_task.decision_payload,
        'already_prepared', true
      );
    end if;

    if v_task.status = 'completed' then
      raise exception 'Workflow task is already completed.' using errcode = '22023';
    end if;
    if v_task.status = 'canceled' then
      raise exception 'Workflow task is canceled.' using errcode = '22023';
    end if;
    if v_account_id is not null and v_task.account_id <> v_account_id then
      raise exception 'Workflow task does not belong to current tenant.' using errcode = '22023';
    end if;
    if v_instance.status <> 'running' then
      raise exception 'Workflow instance is not running.' using errcode = '22023';
    end if;

    v_is_visible := v_user_id is null
      or v_task.assignee_id = v_user_id
      or exists (
        select 1 from jsonb_array_elements(v_candidates) candidate
        where candidate->>'candidate_type' <> 'user'
           or candidate->>'candidate_id' = v_user_id::text
      );
    if not v_is_visible then
      raise exception 'Workflow task cannot be operated by current user.' using errcode = '22023';
    end if;

    v_can_operate := v_user_id is null
      or (v_task.assignee_id is not null and v_task.assignee_id = v_user_id)
      or (
        v_task.assignee_id is null
        and exists (
          select 1 from jsonb_array_elements(v_candidates) candidate
          where (
            (v_action = 'prepare_task_decision' and candidate->>'candidate_type' = 'user')
            or (v_action <> 'prepare_task_decision')
          )
          and (
            candidate->>'candidate_type' <> 'user'
            or candidate->>'candidate_id' = v_user_id::text
          )
        )
      );
    if not v_can_operate then
      if v_action = 'claim_task' then
        raise exception 'Workflow task cannot be claimed by current user.' using errcode = '22023';
      end if;
      raise exception 'Workflow task cannot be operated by current user.' using errcode = '22023';
    end if;
  end if;

  if v_action = 'prepare_task_decision' then
    if nullif(v_task.waitpoint_token_id, '') is null then
      raise exception 'Workflow task is not bound to a Trigger.dev waitpoint.' using errcode = '22023';
    end if;
    if coalesce(v_payload->>'decision_action', '') not in ('approve', 'reject') then
      raise exception 'Unsupported workflow task decision.' using errcode = '22023';
    end if;

    v_comment := coalesce(v_payload->>'comment', '');
    v_variables := coalesce(v_payload->'variables', '{}'::jsonb);
    v_variable_types := coalesce(v_payload->'variable_types', '{}'::jsonb);
    v_decision := jsonb_strip_nulls(jsonb_build_object(
      'action', v_payload->>'decision_action',
      'taskId', v_task.id,
      'nodeId', v_task.node_id,
      'operatorId', v_user_id,
      'comment', v_comment,
      'variables', v_variables,
      'targetNodeId', nullif(v_payload->>'target_node_id', '')
    ));

    update public.wf_task
    set status = 'completed',
        assignee_id = coalesce(assignee_id, v_user_id),
        completed_at = v_now,
        decision_payload = v_decision
    where id = v_task.id;

    if v_payload->>'decision_action' = 'approve' then
      perform public.workflow_runtime_upsert_variables(
        v_instance.id,
        v_variables,
        v_variable_types
      );
      perform public.workflow_runtime_insert_comment(
        v_instance.account_id,
        v_instance.id,
        v_task.id,
        v_task.node_id,
        'approve',
        v_user_id,
        v_comment
      );
      perform public.workflow_runtime_insert_history(
        v_instance.account_id,
        v_instance.id,
        'TASK_COMPLETED',
        v_user_id,
        jsonb_build_object(
          'taskId', v_task.id,
          'nodeId', v_task.node_id,
          'comment', v_comment
        ),
        'task:' || v_task.id::text || ':completed'
      );
    else
      update public.wf_task
      set status = 'canceled',
          completed_at = coalesce(completed_at, v_now)
      where process_instance_id = v_instance.id
        and id <> v_task.id
        and status in ('pending', 'claimed');

      update public.wf_node_instance
      set status = 'completed',
          ended_at = coalesce(ended_at, v_now)
      where id = v_task.node_instance_id;

      update public.wf_process_instance
      set status = 'rejected',
          ended_at = coalesce(ended_at, v_now)
      where id = v_instance.id
        and status = 'running';
      update public.wf_document_binding
      set status = 'rejected'
      where process_instance_id = v_instance.id;

      perform public.workflow_runtime_insert_comment(
        v_instance.account_id,
        v_instance.id,
        v_task.id,
        v_task.node_id,
        'reject',
        v_user_id,
        v_comment
      );
      perform public.workflow_runtime_insert_history(
        v_instance.account_id,
        v_instance.id,
        'TASK_REJECTED',
        v_user_id,
        jsonb_build_object(
          'taskId', v_task.id,
          'nodeId', v_task.node_id,
          'targetNodeId', nullif(v_payload->>'target_node_id', ''),
          'comment', v_comment
        ),
        'task:' || v_task.id::text || ':rejected'
      );
      perform public.workflow_runtime_insert_history(
        v_instance.account_id,
        v_instance.id,
        'PROCESS_REJECTED',
        v_user_id,
        jsonb_build_object('status', 'rejected', 'taskId', v_task.id),
        'process:' || v_instance.id::text || ':rejected'
      );
    end if;

    return jsonb_build_object(
      'task', to_jsonb(v_task),
      'instance', to_jsonb(v_instance),
      'token_id', v_task.waitpoint_token_id,
      'decision', v_decision,
      'already_prepared', false
    );
  end if;

  if v_action = 'mark_waitpoint_completed' then
    v_task_id := nullif(v_payload->>'task_id', '')::uuid;
    update public.wf_task
    set completed_at = coalesce(completed_at, v_now)
    where id = v_task_id;
    return null;
  end if;

  if v_action = 'record_waitpoint_failure' then
    v_task_id := nullif(v_payload->>'task_id', '')::uuid;
    select * into v_task from public.wf_task where id = v_task_id;
    if not found then
      raise exception 'Workflow task not found.' using errcode = 'P0002';
    end if;
    select * into v_instance
    from public.wf_process_instance
    where id = v_task.process_instance_id;
    if not found then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;
    v_message := coalesce(v_payload->>'message', '');
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      'WAITPOINT_COMPLETE_FAILED',
      null,
      jsonb_build_object('taskId', v_task.id, 'message', v_message),
      'task:' || v_task.id::text || ':waitpoint-failed:' || v_message
    );
    return null;
  end if;

  if v_action = 'claim_task' then
    if v_task.assignee_id is not null and v_task.assignee_id <> v_user_id then
      raise exception 'Workflow task has been assigned to another user.' using errcode = '22023';
    end if;
    update public.wf_task
    set status = 'claimed',
        assignee_id = v_user_id,
        claimed_at = v_now
    where id = v_task.id;
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      'TASK_CLAIMED',
      v_user_id,
      jsonb_build_object(
        'taskId', v_task.id,
        'nodeId', v_task.node_id,
        'assigneeId', v_user_id
      ),
      null
    );
    return public.workflow_runtime_task_json(v_task.id);
  end if;

  if v_action = 'transfer_task' then
    v_target_user_id := nullif(v_payload->>'target_user_id', '')::uuid;
    if v_target_user_id is null then
      raise exception 'target_user_id is required.' using errcode = '22023';
    end if;
    perform public.workflow_runtime_assert_account_users(
      v_instance.account_id,
      jsonb_build_array(v_target_user_id)
    );

    update public.wf_task
    set status = 'pending',
        assignee_id = v_target_user_id,
        claimed_at = null
    where id = v_task.id;
    delete from public.wf_task_candidate where task_id = v_task.id;
    insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
    values (
      v_task.id,
      'user',
      v_target_user_id::text,
      jsonb_build_object('id', v_target_user_id, 'transferredBy', v_user_id)
    );
    perform public.workflow_runtime_insert_comment(
      v_instance.account_id,
      v_instance.id,
      v_task.id,
      v_task.node_id,
      'transfer',
      v_user_id,
      coalesce(v_payload->>'comment', '')
    );
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      'TASK_TRANSFERRED',
      v_user_id,
      jsonb_build_object(
        'taskId', v_task.id,
        'nodeId', v_task.node_id,
        'fromUserId', v_task.assignee_id,
        'toUserId', v_target_user_id
      ),
      null
    );
    return public.workflow_runtime_task_json(v_task.id);
  end if;

  if v_action = 'add_sign_task' then
    v_target_user_id := nullif(v_payload->>'target_user_id', '')::uuid;
    if v_target_user_id is null then
      raise exception 'target_user_id is required.' using errcode = '22023';
    end if;
    perform public.workflow_runtime_assert_account_users(
      v_instance.account_id,
      jsonb_build_array(v_target_user_id)
    );
    v_task_id := nullif(v_payload->>'new_task_id', '')::uuid;
    if v_task_id is null then
      raise exception 'new_task_id is required.' using errcode = '22023';
    end if;

    insert into public.wf_task (
      id,
      account_id,
      process_instance_id,
      node_instance_id,
      node_id,
      title,
      status,
      assignee_id,
      waitpoint_token_id
    ) values (
      v_task_id,
      v_task.account_id,
      v_task.process_instance_id,
      v_task.node_instance_id,
      v_task.node_id,
      v_task.title || ' - 加签',
      'pending',
      v_target_user_id,
      nullif(v_payload->>'token_id', '')
    );
    insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
    values (
      v_task_id,
      'user',
      v_target_user_id::text,
      jsonb_build_object('id', v_target_user_id, 'addedBy', v_user_id)
    );
    perform public.workflow_runtime_insert_comment(
      v_instance.account_id,
      v_instance.id,
      v_task.id,
      v_task.node_id,
      'addSign',
      v_user_id,
      coalesce(v_payload->>'comment', '')
    );
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      'TASK_ADD_SIGNED',
      v_user_id,
      jsonb_build_object(
        'taskId', v_task.id,
        'signTaskId', v_task_id,
        'nodeId', v_task.node_id,
        'targetUserId', v_target_user_id
      ),
      null
    );
    return public.workflow_runtime_task_json(v_task_id);
  end if;

  if v_action = 'close_instance' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_user_id := nullif(v_payload->>'user_id', '')::uuid;
    v_status := v_payload->>'status';
    v_event_type := nullif(v_payload->>'event_type', '');
    v_comment := coalesce(v_payload->>'comment', '');
    if v_status not in ('canceled', 'terminated') then
      raise exception 'Unsupported workflow close status.' using errcode = '22023';
    end if;

    select * into v_instance
    from public.wf_process_instance
    where id = v_instance_id
    for update;
    if not found then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;
    if v_instance.account_id <> v_account_id then
      raise exception 'Workflow instance does not belong to current tenant.' using errcode = '22023';
    end if;
    if v_instance.status <> 'running' then
      raise exception 'Workflow instance is not running.' using errcode = '22023';
    end if;
    if v_event_type = 'PROCESS_WITHDRAWN'
       and v_instance.initiator_id is not null
       and v_user_id is not null
       and v_instance.initiator_id <> v_user_id then
      raise exception 'Only workflow initiator can withdraw this instance.' using errcode = '22023';
    end if;

    update public.wf_process_instance
    set status = v_status,
        ended_at = coalesce(ended_at, v_now)
    where id = v_instance.id;
    update public.wf_document_binding
    set status = v_status
    where process_instance_id = v_instance.id;
    update public.wf_task
    set status = 'canceled',
        completed_at = coalesce(completed_at, v_now)
    where process_instance_id = v_instance.id
      and status in ('pending', 'claimed');
    update public.wf_node_instance
    set status = 'skipped',
        ended_at = coalesce(ended_at, v_now)
    where process_instance_id = v_instance.id
      and status in ('created', 'running', 'waiting');
    perform public.workflow_runtime_insert_comment(
      v_instance.account_id,
      v_instance.id,
      null,
      null,
      v_event_type,
      v_user_id,
      v_comment
    );
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      v_event_type,
      v_user_id,
      jsonb_build_object('status', v_status, 'comment', v_comment),
      'process:' || v_instance.id::text || ':' || v_status
    );
    return jsonb_build_object(
      'instance', public.workflow_runtime_instance_json(v_instance.id),
      'trigger_run_id', v_instance.trigger_run_id
    );
  end if;

  if v_action = 'is_instance_running' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    return to_jsonb(coalesce((
      select status = 'running'
      from public.wf_process_instance
      where id = v_instance_id
    ), false));
  end if;

  if v_action = 'create_node_instance' then
    insert into public.wf_node_instance (
      id,
      process_instance_id,
      execution_key,
      node_id,
      node_type,
      name,
      status,
      started_at,
      ended_at
    ) values (
      nullif(v_payload->>'id', '')::uuid,
      nullif(v_payload->>'process_instance_id', '')::uuid,
      nullif(v_payload->>'execution_key', ''),
      nullif(v_payload->>'node_id', ''),
      nullif(v_payload->>'node_type', ''),
      nullif(v_payload->>'name', ''),
      nullif(v_payload->>'status', ''),
      v_now,
      case when v_payload->>'status' = 'completed' then v_now else null end
    )
    on conflict (process_instance_id, execution_key)
    where execution_key is not null
    do update set name = excluded.name
    returning * into v_node;
    return to_jsonb(v_node);
  end if;

  if v_action = 'complete_node_instance' then
    v_node_instance_id := nullif(v_payload->>'node_instance_id', '')::uuid;
    update public.wf_node_instance
    set status = 'completed',
        ended_at = coalesce(ended_at, v_now)
    where id = v_node_instance_id;
    return null;
  end if;

  if v_action = 'fail_node_instance' then
    v_node_instance_id := nullif(v_payload->>'node_instance_id', '')::uuid;
    update public.wf_node_instance
    set status = 'failed',
        ended_at = v_now
    where id = v_node_instance_id
    returning * into v_node;
    if found then
      select * into v_instance
      from public.wf_process_instance
      where id = v_node.process_instance_id;
      perform public.workflow_runtime_insert_history(
        v_instance.account_id,
        v_instance.id,
        'NODE_FAILED',
        null,
        jsonb_build_object(
          'nodeId', v_node.node_id,
          'nodeInstanceId', v_node.id,
          'message', coalesce(v_payload->>'message', '')
        ),
        'node:' || v_node.id::text || ':failed'
      );
    end if;
    return null;
  end if;

  if v_action = 'create_tasks' then
    if jsonb_typeof(v_payload->'items') <> 'array' then
      raise exception 'Workflow task items must be an array.' using errcode = '22023';
    end if;
    v_result := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_payload->'items')
    loop
      v_account_id := nullif(v_item->>'account_id', '')::uuid;
      v_user_ids := '[]'::jsonb;
      if nullif(v_item->>'assignee_id', '') is not null then
        v_user_ids := v_user_ids || jsonb_build_array(v_item->>'assignee_id');
      end if;
      v_candidates := coalesce(v_item->'candidates', '[]'::jsonb);
      if jsonb_typeof(v_candidates) <> 'array' then
        raise exception 'Workflow task candidates must be an array.' using errcode = '22023';
      end if;
      for v_candidate_item in select value from jsonb_array_elements(v_candidates)
      loop
        if v_candidate_item->>'candidate_type' = 'user' then
          v_user_ids := v_user_ids || jsonb_build_array(v_candidate_item->>'candidate_id');
        end if;
      end loop;
      perform public.workflow_runtime_assert_account_users(v_account_id, v_user_ids);

      insert into public.wf_task (
        id,
        account_id,
        process_instance_id,
        node_instance_id,
        node_id,
        title,
        status,
        assignee_id,
        waitpoint_token_id,
        trigger_run_id
      ) values (
        nullif(v_item->>'id', '')::uuid,
        v_account_id,
        nullif(v_item->>'process_instance_id', '')::uuid,
        nullif(v_item->>'node_instance_id', '')::uuid,
        nullif(v_item->>'node_id', ''),
        nullif(v_item->>'title', ''),
        'pending',
        nullif(v_item->>'assignee_id', '')::uuid,
        nullif(v_item->>'waitpoint_token_id', ''),
        nullif(v_item->>'trigger_run_id', '')
      )
      on conflict (waitpoint_token_id)
      where waitpoint_token_id is not null
      do update set title = excluded.title
      returning * into v_task;

      for v_candidate_item in select value from jsonb_array_elements(v_candidates)
      loop
        insert into public.wf_task_candidate (
          id,
          task_id,
          candidate_type,
          candidate_id,
          snapshot
        ) values (
          nullif(v_candidate_item->>'id', '')::uuid,
          v_task.id,
          nullif(v_candidate_item->>'candidate_type', ''),
          nullif(v_candidate_item->>'candidate_id', ''),
          coalesce(v_candidate_item->'snapshot', '{}'::jsonb)
        )
        on conflict (task_id, candidate_type, candidate_id)
        do update set snapshot = excluded.snapshot;
      end loop;
      v_result := v_result || jsonb_build_array(to_jsonb(v_task));
    end loop;
    return v_result;
  end if;

  if v_action = 'list_node_tasks' then
    v_node_instance_id := nullif(v_payload->>'node_instance_id', '')::uuid;
    select coalesce(jsonb_agg(to_jsonb(task_rows) order by task_rows.created_at), '[]'::jsonb)
    into v_result
    from (
      select tasks.*
      from public.wf_task tasks
      where tasks.node_instance_id = v_node_instance_id
      order by tasks.created_at
    ) task_rows;
    return v_result;
  end if;

  if v_action = 'cancel_active_node_tasks' then
    v_node_instance_id := nullif(v_payload->>'node_instance_id', '')::uuid;
    v_task_id := nullif(v_payload->>'except_task_id', '')::uuid;
    update public.wf_task
    set status = 'canceled',
        completed_at = coalesce(completed_at, v_now)
    where node_instance_id = v_node_instance_id
      and (v_task_id is null or id <> v_task_id)
      and status in ('pending', 'claimed');
    return null;
  end if;

  if v_action = 'create_cc_items' then
    if jsonb_typeof(v_payload->'items') <> 'array' then
      raise exception 'Workflow CC items must be an array.' using errcode = '22023';
    end if;
    v_result := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(v_payload->'items')
    loop
      v_account_id := nullif(v_item->>'account_id', '')::uuid;
      v_user_ids := '[]'::jsonb;
      if nullif(v_item->>'recipient_id', '') is not null then
        v_user_ids := v_user_ids || jsonb_build_array(v_item->>'recipient_id');
      end if;
      if v_item->>'candidate_type' = 'user'
         and nullif(v_item->>'candidate_id', '') is not null then
        v_user_ids := v_user_ids || jsonb_build_array(v_item->>'candidate_id');
      end if;
      perform public.workflow_runtime_assert_account_users(v_account_id, v_user_ids);

      insert into public.wf_cc (
        id,
        account_id,
        process_instance_id,
        node_instance_id,
        node_id,
        title,
        recipient_id,
        candidate_type,
        candidate_id
      ) values (
        nullif(v_item->>'id', '')::uuid,
        v_account_id,
        nullif(v_item->>'process_instance_id', '')::uuid,
        nullif(v_item->>'node_instance_id', '')::uuid,
        nullif(v_item->>'node_id', ''),
        nullif(v_item->>'title', ''),
        nullif(v_item->>'recipient_id', '')::uuid,
        nullif(v_item->>'candidate_type', ''),
        nullif(v_item->>'candidate_id', '')
      )
      on conflict (id) do update set title = excluded.title
      returning * into v_cc;
      v_result := v_result || jsonb_build_array(to_jsonb(v_cc));
    end loop;
    return v_result;
  end if;

  if v_action = 'get_variables' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    select coalesce(jsonb_object_agg(variables.key, variables.value), '{}'::jsonb)
    into v_result
    from public.wf_variable variables
    where variables.process_instance_id = v_instance_id;
    return v_result;
  end if;

  if v_action = 'record_history' then
    perform public.workflow_runtime_insert_history(
      nullif(v_payload->>'account_id', '')::uuid,
      nullif(v_payload->>'instance_id', '')::uuid,
      nullif(v_payload->>'event_type', ''),
      nullif(v_payload->>'operator_id', '')::uuid,
      coalesce(v_payload->'payload', '{}'::jsonb),
      nullif(v_payload->>'idempotency_key', '')
    );
    return null;
  end if;

  if v_action = 'set_instance_status' then
    v_instance_id := nullif(v_payload->>'instance_id', '')::uuid;
    v_status := v_payload->>'status';
    if v_status not in ('approved', 'rejected', 'failed') then
      raise exception 'Unsupported workflow instance status.' using errcode = '22023';
    end if;
    select * into v_instance
    from public.wf_process_instance
    where id = v_instance_id;
    if not found then
      raise exception 'Workflow instance not found.' using errcode = 'P0002';
    end if;

    update public.wf_process_instance
    set status = v_status,
        ended_at = coalesce(ended_at, v_now)
    where id = v_instance.id
      and status = 'running';
    if not found and v_instance.status <> v_status then
      return null;
    end if;

    v_event_type := case v_status
      when 'approved' then 'PROCESS_COMPLETED'
      when 'rejected' then 'PROCESS_REJECTED'
      else 'PROCESS_FAILED'
    end;
    perform public.workflow_runtime_insert_history(
      v_instance.account_id,
      v_instance.id,
      v_event_type,
      null,
      jsonb_build_object('status', v_status) || coalesce(v_payload->'payload', '{}'::jsonb),
      'process:' || v_instance.id::text || ':' || v_status
    );
    update public.wf_document_binding
    set status = v_status
    where process_instance_id = v_instance.id;
    return null;
  end if;

  raise exception 'Unsupported workflow runtime action: %.', coalesce(p_action, '')
    using errcode = '22023';
end;
$function$;

revoke all on function public.workflow_runtime_infer_variable_type(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_upsert_variables(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_insert_history(uuid, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_insert_comment(uuid, uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_assert_account_users(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_task_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_instance_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.workflow_runtime_command(text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.workflow_runtime_infer_variable_type(jsonb) to service_role;
grant execute on function public.workflow_runtime_upsert_variables(uuid, jsonb, jsonb) to service_role;
grant execute on function public.workflow_runtime_insert_history(uuid, uuid, text, uuid, jsonb, text) to service_role;
grant execute on function public.workflow_runtime_insert_comment(uuid, uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.workflow_runtime_assert_account_users(uuid, jsonb) to service_role;
grant execute on function public.workflow_runtime_task_json(uuid) to service_role;
grant execute on function public.workflow_runtime_instance_json(uuid) to service_role;
grant execute on function public.workflow_runtime_command(text, jsonb) to service_role;
