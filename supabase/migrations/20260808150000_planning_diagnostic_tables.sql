-- Diagnostic output tables produced by a planning engine run.
-- Execution metadata and plan-version foreign keys are added by later migrations.

begin;

create table if not exists public.planning_problem (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  run_id uuid,
  entity text not null,
  owner text not null,
  name text not null,
  description text not null,
  startdate timestamptz not null,
  enddate timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_constraint (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  run_id uuid,
  demand_id uuid,
  forecast_id uuid,
  item_id uuid,
  entity text not null,
  owner text not null,
  name text not null,
  description text not null,
  startdate timestamptz not null,
  enddate timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id)
);

create table if not exists public.planning_resourceplan (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  run_id uuid,
  resource_id uuid not null,
  startdate timestamptz not null,
  available numeric(30, 8),
  unavailable numeric(30, 8),
  setup numeric(30, 8),
  load numeric(30, 8),
  free numeric(30, 8),
  load_confirmed numeric(30, 8),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (account_id, id),
  unique (account_id, resource_id, startdate)
);

alter table public.planning_constraint
  drop constraint if exists planning_constraint_demand_id_account_fk;
alter table public.planning_constraint
  add constraint planning_constraint_demand_id_account_fk
  foreign key (account_id, demand_id)
  references public.planning_demand(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_constraint
  drop constraint if exists planning_constraint_item_id_account_fk;
alter table public.planning_constraint
  add constraint planning_constraint_item_id_account_fk
  foreign key (account_id, item_id)
  references public.planning_item(account_id, id)
  on delete set null deferrable initially deferred;

alter table public.planning_resourceplan
  drop constraint if exists planning_resourceplan_resource_id_account_fk;
alter table public.planning_resourceplan
  add constraint planning_resourceplan_resource_id_account_fk
  foreign key (account_id, resource_id)
  references public.planning_resource(account_id, id)
  on delete restrict deferrable initially deferred;

alter table public.planning_problem enable row level security;
alter table public.planning_constraint enable row level security;
alter table public.planning_resourceplan enable row level security;

revoke all on public.planning_problem from public, anon, authenticated;
revoke all on public.planning_constraint from public, anon, authenticated;
revoke all on public.planning_resourceplan from public, anon, authenticated;
grant select, insert, update, delete on public.planning_problem to service_role;
grant select, insert, update, delete on public.planning_constraint to service_role;
grant select, insert, update, delete on public.planning_resourceplan to service_role;

commit;
