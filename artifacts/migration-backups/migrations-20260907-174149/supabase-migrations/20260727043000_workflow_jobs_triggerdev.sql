-- Workflow background jobs and timer scheduling tables.

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

create table if not exists public.wf_job (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  code text not null,
  name text not null,
  type text not null check (type in ('once', 'cron', 'interval', 'manual', 'workflow_timer', 'service_task')),
  status text not null default 'draft' check (status in ('draft', 'enabled', 'disabled', 'archived')),
  trigger_task_id text not null,
  schedule_id text,
  cron_expr text,
  timezone text not null default 'Asia/Shanghai',
  payload jsonb not null default '{}'::jsonb,
  retry_policy jsonb not null default '{"maxAttempts":3}'::jsonb,
  timeout_seconds integer check (timeout_seconds is null or timeout_seconds > 0),
  concurrency_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, code)
);

create index if not exists idx_wf_job_lookup
  on public.wf_job (tenant_id, type, status, updated_at desc);

create table if not exists public.wf_job_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  job_id uuid references public.wf_job(id) on delete set null,
  trigger_run_id text,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  attempt integer not null default 1 check (attempt > 0),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_wf_job_run_job
  on public.wf_job_run (tenant_id, job_id, created_at desc);

create index if not exists idx_wf_job_run_status
  on public.wf_job_run (tenant_id, status, created_at desc);

create index if not exists idx_wf_job_run_trigger
  on public.wf_job_run (trigger_run_id);

create table if not exists public.wf_timer_job (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  process_instance_id uuid not null,
  node_instance_id uuid not null,
  node_id text not null,
  definition_id uuid not null,
  definition_version integer not null,
  due_at timestamp with time zone not null,
  status text not null default 'waiting' check (status in ('waiting', 'firing', 'fired', 'failed', 'canceled')),
  trigger_run_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_wf_timer_job_due
  on public.wf_timer_job (tenant_id, status, due_at);

create index if not exists idx_wf_timer_job_instance
  on public.wf_timer_job (tenant_id, process_instance_id, status);

create index if not exists idx_wf_timer_job_node
  on public.wf_timer_job (node_instance_id);

alter table public.wf_job enable row level security;
alter table public.wf_job_run enable row level security;
alter table public.wf_timer_job enable row level security;

do $$
declare
  workflow_table text;
begin
  foreach workflow_table in array array[
    'wf_job',
    'wf_job_run',
    'wf_timer_job'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = workflow_table
        and policyname = 'Admin users can manage workflow jobs'
    ) then
      execute format(
        'create policy "Admin users can manage workflow jobs" on public.%I
          for all
          using (
            exists (
              select 1 from public.users
              where users.id = auth.uid()
                and users.role = ''admin''
            )
          )
          with check (
            exists (
              select 1 from public.users
              where users.id = auth.uid()
                and users.role = ''admin''
            )
          )',
        workflow_table
      );
    end if;
  end loop;
end $$;

