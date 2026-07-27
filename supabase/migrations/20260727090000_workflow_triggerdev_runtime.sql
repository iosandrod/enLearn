-- Trigger.dev runtime ownership for approval workflow instances.
-- This migration removes the self-managed runtime token path from active use and
-- adds projection fields required by Trigger.dev waitpoints and runs.

alter table public.wf_process_instance
  add column if not exists trigger_run_id text,
  add column if not exists trigger_task_id text;

create index if not exists idx_wf_process_instance_trigger_run
  on public.wf_process_instance (trigger_run_id);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'wf_process_instance'
      and constraint_name = 'wf_process_instance_tenant_id_business_key_key'
  ) then
    alter table public.wf_process_instance
      drop constraint wf_process_instance_tenant_id_business_key_key;
  end if;
end $$;

create unique index if not exists uq_wf_process_instance_running_business
  on public.wf_process_instance (tenant_id, business_key)
  where status = 'running';

alter table public.wf_node_instance
  add column if not exists execution_key text;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'wf_node_instance'
      and constraint_name = 'wf_node_instance_status_check'
  ) then
    alter table public.wf_node_instance drop constraint wf_node_instance_status_check;
  end if;

  alter table public.wf_node_instance
    add constraint wf_node_instance_status_check
    check (status in ('created', 'running', 'waiting', 'completed', 'skipped', 'failed'));
end $$;

create unique index if not exists uq_wf_node_instance_execution_key
  on public.wf_node_instance (process_instance_id, execution_key)
  where execution_key is not null;

alter table public.wf_task
  add column if not exists waitpoint_token_id text,
  add column if not exists trigger_run_id text,
  add column if not exists decision_payload jsonb;

create unique index if not exists uq_wf_task_waitpoint_token
  on public.wf_task (waitpoint_token_id)
  where waitpoint_token_id is not null;

create index if not exists idx_wf_task_waitpoint_lookup
  on public.wf_task (tenant_id, waitpoint_token_id);

create index if not exists idx_wf_task_trigger_run
  on public.wf_task (trigger_run_id);

create unique index if not exists uq_wf_task_candidate_identity
  on public.wf_task_candidate (task_id, candidate_type, candidate_id);

alter table public.wf_history_event
  add column if not exists idempotency_key text;

create unique index if not exists uq_wf_history_event_idempotency
  on public.wf_history_event (process_instance_id, idempotency_key)
  where idempotency_key is not null;

comment on table public.wf_execution_token is
  'Deprecated after Trigger.dev migration. Runtime waits are represented by Trigger.dev waitpoint tokens mirrored on wf_task.waitpoint_token_id.';

comment on table public.wf_timer_job is
  'Deprecated for workflow timer nodes after Trigger.dev migration. Timer waits now run inside workflow.instance.run with wait.for/wait.until.';
