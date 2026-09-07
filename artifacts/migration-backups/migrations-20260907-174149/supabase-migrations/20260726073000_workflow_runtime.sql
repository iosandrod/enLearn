-- Approval workflow runtime tables.

create table if not exists public.wf_process_instance (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  definition_id uuid not null references public.wf_process_definition(id) on delete restrict,
  definition_version integer not null,
  business_key text not null,
  document_type text,
  document_id text,
  title text not null,
  status text not null default 'running'
    check (status in ('running', 'approved', 'rejected', 'canceled', 'terminated', 'failed')),
  initiator_id uuid references auth.users(id) on delete set null,
  started_at timestamp with time zone not null default timezone('utc'::text, now()),
  ended_at timestamp with time zone,
  unique (tenant_id, business_key)
);

create index if not exists idx_wf_process_instance_initiator
  on public.wf_process_instance (tenant_id, initiator_id, status, started_at desc);

create index if not exists idx_wf_process_instance_document
  on public.wf_process_instance (tenant_id, document_type, document_id);

create table if not exists public.wf_node_instance (
  id uuid primary key default gen_random_uuid(),
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  name text not null,
  status text not null default 'created'
    check (status in ('created', 'running', 'completed', 'skipped', 'failed')),
  started_at timestamp with time zone,
  ended_at timestamp with time zone
);

create index if not exists idx_wf_node_instance_process
  on public.wf_node_instance (process_instance_id, node_id);

create table if not exists public.wf_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  node_instance_id uuid not null references public.wf_node_instance(id) on delete cascade,
  node_id text not null,
  title text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'canceled')),
  assignee_id uuid references auth.users(id) on delete set null,
  claimed_at timestamp with time zone,
  due_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

create index if not exists idx_wf_task_assignee
  on public.wf_task (tenant_id, assignee_id, status, created_at desc);

create index if not exists idx_wf_task_instance
  on public.wf_task (tenant_id, process_instance_id);

create table if not exists public.wf_task_candidate (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_task(id) on delete cascade,
  candidate_type text not null check (candidate_type in ('user', 'role', 'department')),
  candidate_id text not null,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists idx_wf_task_candidate_lookup
  on public.wf_task_candidate (candidate_type, candidate_id);

create table if not exists public.wf_variable (
  id uuid primary key default gen_random_uuid(),
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  key text not null,
  value jsonb,
  value_type text not null default 'json',
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (process_instance_id, key)
);

create table if not exists public.wf_execution_token (
  id uuid primary key default gen_random_uuid(),
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  node_id text not null,
  status text not null default 'active'
    check (status in ('active', 'waiting', 'completed', 'canceled')),
  parent_token_id uuid references public.wf_execution_token(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.wf_history_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  event_type text not null,
  operator_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_wf_history_event_instance
  on public.wf_history_event (tenant_id, process_instance_id, created_at);

create table if not exists public.wf_document_binding (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  document_type text not null,
  document_id text not null,
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  status text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, document_type, document_id, process_instance_id)
);

create index if not exists idx_wf_document_binding_document
  on public.wf_document_binding (tenant_id, document_type, document_id);

alter table public.wf_process_instance enable row level security;
alter table public.wf_node_instance enable row level security;
alter table public.wf_task enable row level security;
alter table public.wf_task_candidate enable row level security;
alter table public.wf_variable enable row level security;
alter table public.wf_execution_token enable row level security;
alter table public.wf_history_event enable row level security;
alter table public.wf_document_binding enable row level security;

do $$
declare
  workflow_table text;
begin
  foreach workflow_table in array array[
    'wf_process_instance',
    'wf_node_instance',
    'wf_task',
    'wf_task_candidate',
    'wf_variable',
    'wf_execution_token',
    'wf_history_event',
    'wf_document_binding'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = workflow_table
        and policyname = 'Admin users can manage workflow runtime'
    ) then
      execute format(
        'create policy "Admin users can manage workflow runtime" on public.%I
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
