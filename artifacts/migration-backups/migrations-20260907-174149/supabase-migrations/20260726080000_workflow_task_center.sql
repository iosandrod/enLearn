-- Approval workflow task-center extension tables.

create table if not exists public.wf_comment (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  task_id uuid references public.wf_task(id) on delete set null,
  node_id text,
  action text not null,
  operator_id uuid references auth.users(id) on delete set null,
  comment text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists idx_wf_comment_instance
  on public.wf_comment (tenant_id, process_instance_id, created_at);

create table if not exists public.wf_cc (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  process_instance_id uuid not null references public.wf_process_instance(id) on delete cascade,
  node_instance_id uuid not null references public.wf_node_instance(id) on delete cascade,
  node_id text not null,
  title text not null,
  recipient_id uuid references auth.users(id) on delete set null,
  candidate_type text check (candidate_type in ('user', 'role', 'department')),
  candidate_id text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  read_at timestamp with time zone
);

create index if not exists idx_wf_cc_recipient
  on public.wf_cc (tenant_id, recipient_id, created_at desc);

create index if not exists idx_wf_cc_candidate
  on public.wf_cc (tenant_id, candidate_type, candidate_id, created_at desc);

alter table public.wf_comment enable row level security;
alter table public.wf_cc enable row level security;

do $$
declare
  workflow_table text;
begin
  foreach workflow_table in array array[
    'wf_comment',
    'wf_cc'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = workflow_table
        and policyname = 'Admin users can manage workflow task center'
    ) then
      execute format(
        'create policy "Admin users can manage workflow task center" on public.%I
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
