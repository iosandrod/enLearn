-- Runtime contract for TypeScript/Trigger.dev driven supply planning.

begin;

alter table public.planning_run add column if not exists attempt integer not null default 1;
alter table public.planning_run add column if not exists output jsonb;

alter table public.planning_run drop constraint if exists planning_run_attempt_check;
alter table public.planning_run
  add constraint planning_run_attempt_check check (attempt > 0);

alter table public.planning_problem drop constraint if exists planning_problem_run_id_account_fk;
alter table public.planning_problem
  add constraint planning_problem_run_id_account_fk
  foreign key (account_id, run_id) references public.planning_run(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_constraint drop constraint if exists planning_constraint_run_id_account_fk;
alter table public.planning_constraint
  add constraint planning_constraint_run_id_account_fk
  foreign key (account_id, run_id) references public.planning_run(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_resourceplan drop constraint if exists planning_resourceplan_run_id_account_fk;
alter table public.planning_resourceplan
  add constraint planning_resourceplan_run_id_account_fk
  foreign key (account_id, run_id) references public.planning_run(account_id, id)
  on delete cascade deferrable initially deferred;

alter table public.planning_constraint drop constraint if exists planning_constraint_forecast_id_account_fk;
alter table public.planning_constraint
  add constraint planning_constraint_forecast_id_account_fk
  foreign key (account_id, forecast_id) references public.planning_forecast(account_id, id)
  on delete set null deferrable initially deferred;

create or replace function public.planning_guard_run_status()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('succeeded', 'failed', 'canceled') then
    return old;
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'queued' and new.status in ('running', 'succeeded', 'failed', 'canceled'))
      or (old.status = 'running' and new.status in ('succeeded', 'failed', 'canceled'))
    ) then
      raise exception 'Invalid planning run status transition: % -> %.', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_run_status_guard on public.planning_run;
create trigger planning_run_status_guard
before update on public.planning_run
for each row execute function public.planning_guard_run_status();

create or replace function public.planning_guard_terminal_version()
returns trigger
language plpgsql
as $function$
declare
  system_write boolean := coalesce(current_setting('planning.system_version_write', true), '') = 'on';
begin
  if old.status = 'canceled' then
    raise exception 'Canceled plan versions are immutable.' using errcode = '23514';
  end if;
  if old.status = 'superseded' then
    raise exception 'Superseded plan versions are immutable.' using errcode = '23514';
  end if;
  if old.status = 'published' then
    if not (system_write and new.status = 'superseded') then
      raise exception 'Published plan versions are immutable.' using errcode = '23514';
    end if;
    if (to_jsonb(new) - 'status' - 'is_current' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'is_current' - 'updated_at') then
      raise exception 'Published plan version content is immutable.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists planning_plan_version_zz_terminal_guard on public.planning_plan_version;
create trigger planning_plan_version_zz_terminal_guard
before update on public.planning_plan_version
for each row execute function public.planning_guard_terminal_version();

create or replace function public.planning_guard_workflow_run_status()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('succeeded', 'failed', 'canceled') then return old; end if;
  return new;
end;
$function$;

drop trigger if exists wf_job_run_terminal_status_guard on public.wf_job_run;
create trigger wf_job_run_terminal_status_guard
before update of status on public.wf_job_run
for each row execute function public.planning_guard_workflow_run_status();

create or replace function public.planning_finish_plan_version(
  p_account_id uuid,
  p_version_id uuid,
  p_status text,
  p_result_summary jsonb default '{}'::jsonb
)
returns public.planning_plan_version
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  version_run_id uuid;
  version_row public.planning_plan_version;
begin
  if p_status not in ('completed', 'failed', 'canceled') then
    raise exception 'Invalid terminal plan version status.' using errcode = '22023';
  end if;

  select run_id into version_run_id
  from public.planning_plan_version
  where account_id = p_account_id and id = p_version_id;
  if not found then
    raise exception 'Plan version not found.' using errcode = 'P0002';
  end if;
  if version_run_id is not null then
    perform 1 from public.planning_run
    where account_id = p_account_id and id = version_run_id
    for update;
  end if;
  select * into version_row
  from public.planning_plan_version
  where account_id = p_account_id and id = p_version_id
  for update;

  if version_row.status in ('published', 'superseded', 'canceled') then
    if version_row.status = p_status then return version_row; end if;
    raise exception 'Terminal plan version cannot be overwritten: %.', version_row.status
      using errcode = '23514';
  end if;
  if version_row.status in ('completed', 'failed') then
    if version_row.status = p_status then return version_row; end if;
    raise exception 'Plan version is already finished: %.', version_row.status using errcode = '23514';
  end if;

  perform set_config('planning.system_version_write', 'on', true);
  update public.planning_plan_version
  set status = p_status,
      completed_at = timezone('utc'::text, now()),
      result_summary = case when p_status = 'completed' then coalesce(p_result_summary, '{}'::jsonb)
                            else result_summary end,
      updated_at = timezone('utc'::text, now())
  where account_id = p_account_id and id = p_version_id
    and status in ('draft', 'running')
  returning * into version_row;
  return version_row;
end;
$function$;

revoke all on function public.planning_finish_plan_version(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.planning_finish_plan_version(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.planning_create_supply_run(
  p_account_id uuid,
  p_scenario_id uuid,
  p_name text default null,
  p_arguments jsonb default '{}'::jsonb,
  p_submitted_by uuid default null,
  p_job_type text default 'supply_plan'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  run_row public.planning_run;
  version_row public.planning_plan_version;
  run_name text;
begin
  if p_job_type is distinct from 'supply_plan' then
    raise exception 'Only supply_plan execution is supported.' using errcode = '22023';
  end if;
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from basejump.account_user membership
    where membership.account_id = p_account_id and membership.user_id = auth.uid()
  ) then
    raise exception 'Account membership required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.planning_scenario scenario
    where scenario.account_id = p_account_id and scenario.id = p_scenario_id
  ) then
    raise exception 'Planning scenario not found.' using errcode = 'P0002';
  end if;

  run_name := coalesce(nullif(btrim(p_name), ''), 'Supply plan ' || to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS'));
  insert into public.planning_run (
    account_id, scenario_id, name, submitted, arguments, status, message,
    progress, submitted_by, attempt
  ) values (
    p_account_id, p_scenario_id, run_name, timezone('utc', now()),
    coalesce(p_arguments, '{}'::jsonb) || jsonb_build_object('jobType', 'supply_plan'),
    'queued', '等待 Trigger.dev 调度', 0, coalesce(p_submitted_by, auth.uid()), 1
  ) returning * into run_row;

  perform set_config('planning.system_version_write', 'on', true);
  insert into public.planning_plan_version (
    account_id, code, name, scenario_id, run_id, status, input_cutoff,
    solver, parameters, input_snapshot, result_summary, source
  ) values (
    p_account_id,
    'RUN-' || upper(left(replace(run_row.id::text, '-', ''), 12)),
    run_name,
    p_scenario_id,
    run_row.id,
    'draft',
    run_row.submitted,
    'frepple',
    coalesce(p_arguments->'overrides', '{}'::jsonb),
    '{}'::jsonb,
    '{}'::jsonb,
    'planning.run'
  ) returning * into version_row;

  return jsonb_build_object('run', to_jsonb(run_row), 'version', to_jsonb(version_row));
end;
$function$;

revoke all on function public.planning_create_supply_run(uuid, uuid, text, jsonb, uuid, text)
  from public, anon;
grant execute on function public.planning_create_supply_run(uuid, uuid, text, jsonb, uuid, text)
  to authenticated, service_role;

create or replace function public.planning_project_trigger_run(
  p_account_id uuid,
  p_run_id uuid,
  p_trigger_run_id text
)
returns public.planning_run
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  run_row public.planning_run;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_trigger_run_id), '') is null then
    raise exception 'Trigger run id is required.' using errcode = '22023';
  end if;
  select * into run_row from public.planning_run
  where account_id = p_account_id and id = p_run_id for update;
  if not found then raise exception 'Planning run not found.' using errcode = 'P0002'; end if;
  if run_row.trigger_run_id is not null and run_row.trigger_run_id <> btrim(p_trigger_run_id) then
    raise exception 'Planning run is already linked to another Trigger run.' using errcode = '23505';
  end if;
  update public.planning_run
  set trigger_run_id = btrim(p_trigger_run_id), updated_at = timezone('utc', now())
  where account_id = p_account_id and id = p_run_id
  returning * into run_row;
  return run_row;
end;
$function$;

revoke all on function public.planning_project_trigger_run(uuid, uuid, text) from public, anon;
grant execute on function public.planning_project_trigger_run(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.planning_cancel_supply_run(
  p_account_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  run_row public.planning_run;
  version_row public.planning_plan_version;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  select * into run_row from public.planning_run
  where account_id = p_account_id and id = p_run_id for update;
  if not found then raise exception 'Planning run not found.' using errcode = 'P0002'; end if;
  select * into version_row from public.planning_plan_version
  where account_id = p_account_id and run_id = p_run_id
  order by created_at desc limit 1 for update;

  if run_row.status in ('succeeded', 'failed') then
    raise exception 'Finished planning run cannot be canceled: %.', run_row.status using errcode = '23514';
  end if;
  if run_row.status <> 'canceled' then
    update public.planning_run
    set status = 'canceled', progress = 100, message = '排产已取消', processid = null,
        finished = timezone('utc', now()), updated_at = timezone('utc', now())
    where account_id = p_account_id and id = p_run_id and status in ('queued', 'running')
    returning * into run_row;
  end if;
  if version_row.id is not null and version_row.status in ('draft', 'running') then
    perform set_config('planning.system_version_write', 'on', true);
    update public.planning_plan_version
    set status = 'canceled', completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where account_id = p_account_id and id = version_row.id
      and status in ('draft', 'running')
    returning * into version_row;
  end if;
  update public.wf_job_run
  set status = 'canceled', finished_at = timezone('utc', now())
  where account_id = p_account_id and id = p_run_id and status in ('queued', 'running');

  return jsonb_build_object(
    'run', to_jsonb(run_row),
    'version', case when version_row.id is null then null else to_jsonb(version_row) end,
    'triggerRunId', run_row.trigger_run_id
  );
end;
$function$;

revoke all on function public.planning_cancel_supply_run(uuid, uuid) from public, anon;
grant execute on function public.planning_cancel_supply_run(uuid, uuid)
  to authenticated, service_role;

create or replace function public.planning_fail_supply_run(
  p_account_id uuid,
  p_run_id uuid,
  p_message text default 'Planning execution failed.'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  run_row public.planning_run;
  version_row public.planning_plan_version;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  select * into run_row from public.planning_run
  where account_id = p_account_id and id = p_run_id for update;
  if not found then raise exception 'Planning run not found.' using errcode = 'P0002'; end if;
  select * into version_row from public.planning_plan_version
  where account_id = p_account_id and run_id = p_run_id
  order by created_at desc limit 1 for update;

  if run_row.status in ('queued', 'running') then
    update public.planning_run
    set status = 'failed', progress = 100, message = left(coalesce(p_message, 'Planning execution failed.'), 4000),
        processid = null, finished = timezone('utc', now()), updated_at = timezone('utc', now())
    where account_id = p_account_id and id = p_run_id and status in ('queued', 'running')
    returning * into run_row;
  end if;
  if version_row.id is not null and version_row.status in ('draft', 'running') then
    perform set_config('planning.system_version_write', 'on', true);
    update public.planning_plan_version
    set status = 'failed', completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where account_id = p_account_id and id = version_row.id and status in ('draft', 'running')
    returning * into version_row;
  end if;
  return jsonb_build_object('run', to_jsonb(run_row), 'version', to_jsonb(version_row));
end;
$function$;

revoke all on function public.planning_fail_supply_run(uuid, uuid, text) from public, anon;
grant execute on function public.planning_fail_supply_run(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.planning_get_run_detail(
  p_account_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  run_row public.planning_run;
  version_row public.planning_plan_version;
  result jsonb;
begin
  if auth.uid() is not null and not public.has_account_permission(p_account_id, 'planning.models.manage') then
    raise exception 'Planning manage permission required.' using errcode = '42501';
  end if;
  select * into run_row from public.planning_run
  where account_id = p_account_id and id = p_run_id;
  if not found then raise exception 'Planning run not found.' using errcode = 'P0002'; end if;
  select * into version_row from public.planning_plan_version
  where account_id = p_account_id and run_id = p_run_id
  order by created_at desc limit 1;

  result := jsonb_build_object(
    'run', to_jsonb(run_row),
    'version', case when version_row.id is null then null else to_jsonb(version_row) end,
    'counts', jsonb_build_object(
      'operationPlans', (select count(*) from public.planning_operationplan where account_id = p_account_id and plan_version_id = version_row.id),
      'operationPlanMaterials', (select count(*) from public.planning_operationplanmaterial where account_id = p_account_id and plan_version_id = version_row.id),
      'operationPlanResources', (select count(*) from public.planning_operationplanresource where account_id = p_account_id and plan_version_id = version_row.id),
      'problems', (select count(*) from public.planning_problem where account_id = p_account_id and plan_version_id = version_row.id),
      'constraints', (select count(*) from public.planning_constraint where account_id = p_account_id and plan_version_id = version_row.id),
      'resourcePlans', (select count(*) from public.planning_resourceplan where account_id = p_account_id and plan_version_id = version_row.id)
    ),
    'problems', coalesce((
      select jsonb_agg(to_jsonb(problem_rows) order by problem_rows.startdate, problem_rows.id)
      from (
        select * from public.planning_problem
        where account_id = p_account_id and plan_version_id = version_row.id
        order by startdate, id limit 200
      ) problem_rows
    ), '[]'::jsonb),
    'constraints', coalesce((
      select jsonb_agg(to_jsonb(constraint_rows) order by constraint_rows.startdate, constraint_rows.id)
      from (
        select * from public.planning_constraint
        where account_id = p_account_id and plan_version_id = version_row.id
        order by startdate, id limit 200
      ) constraint_rows
    ), '[]'::jsonb)
  );
  return result;
end;
$function$;

revoke all on function public.planning_get_run_detail(uuid, uuid) from public, anon;
grant execute on function public.planning_get_run_detail(uuid, uuid)
  to authenticated, service_role;

create or replace function public.planning_sync_workflow_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  planning_schedule_id uuid;
  planning_scenario_id uuid;
  planning_job_type text;
  planning_status text;
  planning_version_status text;
  planning_name text;
begin
  if new.job_id is null then return new; end if;
  select nullif(job.payload->>'planningScheduleId', '')::uuid,
         nullif(job.payload->>'planningScenarioId', '')::uuid,
         coalesce(nullif(job.payload->>'planningJobType', ''), 'supply_plan'),
         job.name
    into planning_schedule_id, planning_scenario_id, planning_job_type, planning_name
  from public.wf_job job
  where job.id = new.job_id and job.account_id = new.account_id;
  if planning_schedule_id is null or planning_scenario_id is null then return new; end if;
  if planning_job_type <> 'supply_plan' then return new; end if;

  planning_status := case new.status
    when 'queued' then 'queued'
    when 'running' then 'running'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'canceled' then 'canceled'
    else 'running'
  end;
  planning_version_status := case planning_status
    when 'queued' then 'draft'
    when 'running' then 'running'
    when 'succeeded' then 'completed'
    when 'failed' then 'failed'
    else 'canceled'
  end;

  insert into public.planning_run (
    id, account_id, scenario_id, workflow_job_id, name, submitted, started, finished,
    arguments, status, message, trigger_run_id, progress, attempt, output
  ) values (
    new.id, new.account_id, planning_scenario_id, planning_schedule_id,
    coalesce(planning_name, 'Scheduled supply plan'), new.created_at, new.started_at, new.finished_at,
    coalesce(new.input, '{}'::jsonb), planning_status, new.error_message, new.trigger_run_id,
    case when planning_status in ('succeeded', 'failed', 'canceled') then 100
         when planning_status = 'running' then 5 else 0 end,
    greatest(coalesce(new.attempt, 1), 1), new.output
  )
  on conflict (id) do update set
    started = coalesce(public.planning_run.started, excluded.started),
    finished = excluded.finished,
    status = excluded.status,
    message = coalesce(excluded.message, public.planning_run.message),
    trigger_run_id = coalesce(excluded.trigger_run_id, public.planning_run.trigger_run_id),
    progress = greatest(public.planning_run.progress, excluded.progress),
    attempt = greatest(public.planning_run.attempt, excluded.attempt),
    output = coalesce(excluded.output, public.planning_run.output),
    updated_at = timezone('utc', now())
  where public.planning_run.status in ('queued', 'running');

  perform set_config('planning.system_version_write', 'on', true);
  insert into public.planning_plan_version (
    account_id, code, name, scenario_id, run_id, status, input_cutoff,
    solver, parameters, input_snapshot, started_at, completed_at, source
  ) values (
    new.account_id,
    'RUN-' || upper(left(replace(new.id::text, '-', ''), 12)),
    coalesce(planning_name, 'Scheduled supply plan') || ' ' || to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    planning_scenario_id, new.id, planning_version_status, new.created_at,
    'frepple', coalesce(new.input->'overrides', '{}'::jsonb), '{}'::jsonb,
    new.started_at,
    case when planning_version_status in ('completed', 'failed', 'canceled') then new.finished_at else null end,
    'planning.run'
  )
  on conflict (account_id, run_id) where run_id is not null do update set
    status = excluded.status,
    started_at = coalesce(public.planning_plan_version.started_at, excluded.started_at),
    completed_at = coalesce(excluded.completed_at, public.planning_plan_version.completed_at),
    updated_at = timezone('utc', now())
  where public.planning_plan_version.status in ('draft', 'running');
  return new;
end;
$function$;

drop trigger if exists planning_workflow_run_bridge on public.wf_job_run;
create trigger planning_workflow_run_bridge
after insert or update of status, started_at, finished_at, error_message, trigger_run_id, attempt, output
on public.wf_job_run
for each row execute function public.planning_sync_workflow_run();

commit;
