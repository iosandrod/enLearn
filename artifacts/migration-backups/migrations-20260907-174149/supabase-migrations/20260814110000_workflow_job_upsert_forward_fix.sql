-- Forward migration for installations that already applied the original workflow Job RPC.
-- Keep this definition in sync with 20260806140000_workflow_job_rpc.sql.

create or replace function public.workflow_job_command(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_account_id uuid;
  v_model_id text;
  v_job_id uuid;
  v_run_id uuid;
  v_job public.wf_job%rowtype;
  v_run public.wf_job_run%rowtype;
  v_input jsonb;
  v_result jsonb;
  v_limit integer;
  v_occurrence_key text;
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_reused boolean := false;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'workflow_job_command payload must be an object.' using errcode = '22023';
  end if;

  if v_action in ('create_job', 'upsert_job') then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    if v_account_id is null then
      raise exception 'account_id is required.' using errcode = '22023';
    end if;

    v_model_id := nullif(btrim(v_payload->>'model_id'), '');
    if v_action = 'upsert_job' and v_model_id is not null then
      select jobs.*
      into v_job
      from public.wf_job jobs
      where jobs.account_id = v_account_id
        and jobs.payload #>> '{triggerWorkflow,modelId}' = v_model_id
      order by jobs.updated_at desc
      limit 1
      for update;

      if found then
        update public.wf_job
        set code = nullif(btrim(v_payload->>'code'), ''),
            name = nullif(btrim(v_payload->>'name'), ''),
            type = nullif(btrim(v_payload->>'type'), ''),
            trigger_task_id = nullif(btrim(v_payload->>'trigger_task_id'), ''),
            cron_expr = nullif(btrim(v_payload->>'cron_expr'), ''),
            timezone = coalesce(nullif(btrim(v_payload->>'timezone'), ''), 'Asia/Shanghai'),
            payload = case
              when jsonb_typeof(v_payload->'payload') = 'object' then v_payload->'payload'
              else '{}'::jsonb
            end,
            retry_policy = case
              when jsonb_typeof(v_payload->'retry_policy') = 'object' then v_payload->'retry_policy'
              else '{"maxAttempts":3}'::jsonb
            end,
            timeout_seconds = nullif(v_payload->>'timeout_seconds', '')::integer,
            concurrency_key = nullif(btrim(v_payload->>'concurrency_key'), ''),
            status = case when status = 'archived' then 'draft' else status end,
            updated_at = v_now
        where id = v_job.id
        returning * into v_job;

        return to_jsonb(v_job);
      end if;
    end if;

    insert into public.wf_job (
      account_id,
      code,
      name,
      type,
      status,
      trigger_task_id,
      cron_expr,
      timezone,
      payload,
      retry_policy,
      timeout_seconds,
      concurrency_key,
      created_by
    ) values (
      v_account_id,
      nullif(btrim(v_payload->>'code'), ''),
      nullif(btrim(v_payload->>'name'), ''),
      nullif(btrim(v_payload->>'type'), ''),
      'draft',
      nullif(btrim(v_payload->>'trigger_task_id'), ''),
      nullif(btrim(v_payload->>'cron_expr'), ''),
      coalesce(nullif(btrim(v_payload->>'timezone'), ''), 'Asia/Shanghai'),
      case
        when jsonb_typeof(v_payload->'payload') = 'object' then v_payload->'payload'
        else '{}'::jsonb
      end,
      case
        when jsonb_typeof(v_payload->'retry_policy') = 'object' then v_payload->'retry_policy'
        else '{"maxAttempts":3}'::jsonb
      end,
      nullif(v_payload->>'timeout_seconds', '')::integer,
      nullif(btrim(v_payload->>'concurrency_key'), ''),
      nullif(v_payload->>'created_by', '')::uuid
    )
    on conflict (account_id, code) do update set
      name = excluded.name,
      type = excluded.type,
      trigger_task_id = excluded.trigger_task_id,
      schedule_id = public.wf_job.schedule_id,
      cron_expr = excluded.cron_expr,
      timezone = excluded.timezone,
      payload = excluded.payload,
      retry_policy = excluded.retry_policy,
      timeout_seconds = excluded.timeout_seconds,
      concurrency_key = excluded.concurrency_key,
      status = case
        when public.wf_job.status = 'archived' then 'draft'
        else public.wf_job.status
      end,
      updated_at = v_now
    where v_action = 'upsert_job'
    returning * into v_job;

    if not found then
      raise exception 'Workflow job code already exists: %.', coalesce(v_payload->>'code', '')
        using errcode = '23505';
    end if;

    return to_jsonb(v_job);
  end if;

  if v_action = 'list_jobs' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    if v_account_id is null then
      raise exception 'account_id is required.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(job_rows) order by job_rows.updated_at desc), '[]'::jsonb)
    into v_result
    from (
      select jobs.*
      from public.wf_job jobs
      where jobs.account_id = v_account_id
        and (
          nullif(btrim(v_payload->>'type'), '') is null
          or jobs.type = btrim(v_payload->>'type')
        )
        and (
          nullif(btrim(v_payload->>'status'), '') is null
          or jobs.status = btrim(v_payload->>'status')
        )
      order by jobs.updated_at desc
      limit 200
    ) job_rows;

    return v_result;
  end if;

  if v_action = 'get_job' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_job_id := nullif(v_payload->>'job_id', '')::uuid;
    if v_account_id is null or v_job_id is null then
      raise exception 'account_id and job_id are required.' using errcode = '22023';
    end if;

    select *
    into v_job
    from public.wf_job
    where id = v_job_id
      and account_id = v_account_id;

    if not found then
      return null;
    end if;
    return to_jsonb(v_job);
  end if;

  if v_action = 'update_job_status' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    v_job_id := nullif(v_payload->>'job_id', '')::uuid;
    if v_account_id is null or v_job_id is null then
      raise exception 'account_id and job_id are required.' using errcode = '22023';
    end if;
    if coalesce(v_payload->>'status', '') not in ('draft', 'enabled', 'disabled', 'archived') then
      raise exception 'Unsupported workflow job status: %.', coalesce(v_payload->>'status', '')
        using errcode = '22023';
    end if;

    update public.wf_job
    set status = v_payload->>'status',
        schedule_id = nullif(btrim(v_payload->>'schedule_id'), ''),
        updated_at = v_now
    where id = v_job_id
      and account_id = v_account_id
    returning * into v_job;

    if not found then
      return null;
    end if;
    return to_jsonb(v_job);
  end if;

  if v_action = 'create_run' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    if v_account_id is null then
      raise exception 'account_id is required.' using errcode = '22023';
    end if;
    if coalesce(v_payload->>'status', '') not in ('queued', 'running', 'succeeded', 'failed', 'canceled') then
      raise exception 'Unsupported workflow job run status: %.', coalesce(v_payload->>'status', '')
        using errcode = '22023';
    end if;

    insert into public.wf_job_run (
      account_id,
      job_id,
      trigger_run_id,
      status,
      attempt,
      input
    ) values (
      v_account_id,
      nullif(v_payload->>'job_id', '')::uuid,
      nullif(btrim(v_payload->>'trigger_run_id'), ''),
      v_payload->>'status',
      greatest(coalesce(nullif(v_payload->>'attempt', '')::integer, 1), 1),
      case
        when jsonb_typeof(v_payload->'input') = 'object' then v_payload->'input'
        else '{}'::jsonb
      end
    )
    returning * into v_run;

    return to_jsonb(v_run);
  end if;

  if v_action = 'project_trigger_run' then
    v_run_id := nullif(v_payload->>'run_id', '')::uuid;
    if v_run_id is null or nullif(btrim(v_payload->>'trigger_run_id'), '') is null then
      raise exception 'run_id and trigger_run_id are required.' using errcode = '22023';
    end if;

    update public.wf_job_run
    set trigger_run_id = nullif(btrim(v_payload->>'trigger_run_id'), '')
    where id = v_run_id
      and (
        nullif(v_payload->>'account_id', '') is null
        or account_id = (v_payload->>'account_id')::uuid
      )
    returning * into v_run;

    if not found then
      return null;
    end if;
    return to_jsonb(v_run);
  end if;

  if v_action = 'mark_run_running' then
    v_run_id := nullif(v_payload->>'run_id', '')::uuid;
    if v_run_id is null then
      raise exception 'run_id is required.' using errcode = '22023';
    end if;

    update public.wf_job_run
    set status = 'running',
        started_at = coalesce(started_at, v_now)
    where id = v_run_id
    returning * into v_run;

    if not found then
      return null;
    end if;
    return to_jsonb(v_run);
  end if;

  if v_action = 'finish_run' then
    v_run_id := nullif(v_payload->>'run_id', '')::uuid;
    if v_run_id is null then
      raise exception 'run_id is required.' using errcode = '22023';
    end if;
    if coalesce(v_payload->>'status', '') not in ('succeeded', 'failed', 'canceled') then
      raise exception 'A finished run must be succeeded, failed, or canceled.' using errcode = '22023';
    end if;

    update public.wf_job_run
    set status = v_payload->>'status',
        output = case
          when jsonb_typeof(v_payload->'output') = 'object' then v_payload->'output'
          else '{}'::jsonb
        end,
        error_message = nullif(v_payload->>'error_message', ''),
        finished_at = v_now
    where id = v_run_id
    returning * into v_run;

    if not found then
      return null;
    end if;
    return to_jsonb(v_run);
  end if;

  if v_action = 'list_runs' then
    v_account_id := nullif(v_payload->>'account_id', '')::uuid;
    if v_account_id is null then
      raise exception 'account_id is required.' using errcode = '22023';
    end if;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit', '')::integer, 20), 1), 200);

    select coalesce(jsonb_agg(to_jsonb(run_rows) order by run_rows.created_at desc), '[]'::jsonb)
    into v_result
    from (
      select job_runs.*
      from public.wf_job_run job_runs
      where job_runs.account_id = v_account_id
        and (
          nullif(v_payload->>'job_id', '') is null
          or job_runs.job_id = (v_payload->>'job_id')::uuid
        )
        and (
          nullif(btrim(v_payload->>'status'), '') is null
          or job_runs.status = btrim(v_payload->>'status')
        )
      order by job_runs.created_at desc
      limit v_limit
    ) run_rows;

    return v_result;
  end if;

  if v_action = 'prepare_scheduled_run' then
    v_job_id := nullif(v_payload->>'job_id', '')::uuid;
    if v_job_id is null then
      raise exception 'job_id is required.' using errcode = '22023';
    end if;

    v_occurrence_key := coalesce(
      nullif(btrim(v_payload->>'occurrence_key'), ''),
      concat_ws(
        ':',
        v_job_id::text,
        coalesce(nullif(btrim(v_payload->>'schedule_id'), ''), 'schedule'),
        coalesce(nullif(btrim(v_payload->>'scheduled_at'), ''), 'unknown')
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('workflow-job-occurrence:' || v_occurrence_key, 0)
    );

    select *
    into v_job
    from public.wf_job
    where id = v_job_id
      and status = 'enabled'
      and type in ('cron', 'interval')
    for update;

    if not found then
      return jsonb_build_object(
        'skipped', true,
        'jobId', v_job_id,
        'reason', 'Job is missing or disabled.'
      );
    end if;

    v_input := coalesce(v_job.payload, '{}'::jsonb) || jsonb_build_object(
      'jobId', v_job.id,
      'tenantId', v_job.account_id,
      'scheduled', true,
      'scheduleId', nullif(btrim(v_payload->>'schedule_id'), ''),
      'scheduledAt', nullif(btrim(v_payload->>'scheduled_at'), ''),
      'scheduleOccurrenceKey', v_occurrence_key
    );

    select *
    into v_run
    from public.wf_job_run
    where job_id = v_job.id
      and input->>'scheduleOccurrenceKey' = v_occurrence_key
    order by created_at desc
    limit 1;

    if found then
      v_reused := true;
    else
      insert into public.wf_job_run (
        account_id,
        job_id,
        status,
        attempt,
        input
      ) values (
        v_job.account_id,
        v_job.id,
        'queued',
        1,
        v_input
      )
      returning * into v_run;
    end if;

    return jsonb_build_object(
      'skipped', false,
      'reused', v_reused,
      'job', to_jsonb(v_job),
      'run', to_jsonb(v_run),
      'triggerPayload', v_input
    );
  end if;

  if v_action = 'list_users' then
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit', '')::integer, 20), 1), 200);
    select coalesce(jsonb_agg(to_jsonb(user_rows)), '[]'::jsonb)
    into v_result
    from (
      select users.*
      from public.users users
      order by users.id
      limit v_limit
    ) user_rows;
    return v_result;
  end if;

  raise exception 'Unsupported workflow job action: %.', coalesce(p_action, '')
    using errcode = '22023';
end;
$function$;

revoke all on function public.workflow_job_command(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.workflow_job_command(text, jsonb)
  to service_role;
