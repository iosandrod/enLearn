-- Approval workflow definition tables.

create table if not exists public.wf_model (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  code text not null,
  name text not null,
  document_type text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'disabled', 'archived')),
  current_version integer not null default 0,
  draft_schema jsonb not null default '{"schemaVersion":1,"nodes":[],"edges":[]}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, code)
);

drop trigger if exists set_wf_model_updated_at on public.wf_model;
create trigger set_wf_model_updated_at
before update on public.wf_model
for each row
execute function public.set_updated_at();

create index if not exists idx_wf_model_tenant_document_status
  on public.wf_model (tenant_id, document_type, status);

create table if not exists public.wf_model_version (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.wf_model(id) on delete cascade,
  version integer not null,
  schema jsonb not null,
  remark text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (model_id, version)
);

create table if not exists public.wf_process_definition (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default',
  model_id uuid not null references public.wf_model(id) on delete cascade,
  model_version_id uuid not null references public.wf_model_version(id) on delete cascade,
  code text not null,
  name text not null,
  version integer not null,
  document_type text,
  schema jsonb not null,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'archived')),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (tenant_id, code, version)
);

create index if not exists idx_wf_process_definition_document_status
  on public.wf_process_definition (tenant_id, document_type, status);

create table if not exists public.wf_node_definition (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.wf_process_definition(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  unique (definition_id, node_id)
);

create index if not exists idx_wf_node_definition_type
  on public.wf_node_definition (definition_id, node_type);

create table if not exists public.wf_edge_definition (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.wf_process_definition(id) on delete cascade,
  edge_id text not null,
  source_node_id text not null,
  target_node_id text not null,
  condition jsonb,
  priority integer,
  unique (definition_id, edge_id)
);

create index if not exists idx_wf_edge_definition_source
  on public.wf_edge_definition (definition_id, source_node_id);

alter table public.wf_model enable row level security;
alter table public.wf_model_version enable row level security;
alter table public.wf_process_definition enable row level security;
alter table public.wf_node_definition enable row level security;
alter table public.wf_edge_definition enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wf_model'
      and policyname = 'Admin users can manage workflow models'
  ) then
    create policy "Admin users can manage workflow models" on public.wf_model
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wf_model_version'
      and policyname = 'Admin users can manage workflow model versions'
  ) then
    create policy "Admin users can manage workflow model versions" on public.wf_model_version
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wf_process_definition'
      and policyname = 'Admin users can manage workflow definitions'
  ) then
    create policy "Admin users can manage workflow definitions" on public.wf_process_definition
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wf_node_definition'
      and policyname = 'Admin users can manage workflow node definitions'
  ) then
    create policy "Admin users can manage workflow node definitions" on public.wf_node_definition
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wf_edge_definition'
      and policyname = 'Admin users can manage workflow edge definitions'
  ) then
    create policy "Admin users can manage workflow edge definitions" on public.wf_edge_definition
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;
end $$;
