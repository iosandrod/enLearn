-- Entity table designer metadata and route registration.

create table if not exists public.entity_design_tables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  schema_name text not null default 'public',
  table_name text not null,
  title text not null,
  description text,
  primary_key text not null default 'id',
  status text not null default 'active'
    check (status in ('active', 'inactive', 'draft', 'archived')),
  position_x integer not null default 80,
  position_y integer not null default 80,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (schema_name, table_name)
);

drop trigger if exists set_entity_design_tables_updated_at on public.entity_design_tables;
create trigger set_entity_design_tables_updated_at
before update on public.entity_design_tables
for each row
execute function public.set_updated_at();

create table if not exists public.entity_design_columns (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.entity_design_tables(id) on delete cascade,
  column_name text not null,
  label text not null,
  data_type text not null default 'text',
  data_type_config jsonb not null default '{}'::jsonb,
  storage_kind text not null default 'physical'
    check (storage_kind in ('physical', 'virtual')),
  expression text,
  is_required boolean not null default false,
  is_primary_key boolean not null default false,
  is_unique boolean not null default false,
  default_value text,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'draft', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (table_id, column_name)
);

drop trigger if exists set_entity_design_columns_updated_at on public.entity_design_columns;
create trigger set_entity_design_columns_updated_at
before update on public.entity_design_columns
for each row
execute function public.set_updated_at();

create table if not exists public.entity_design_relations (
  id uuid primary key default gen_random_uuid(),
  source_table_id uuid not null references public.entity_design_tables(id) on delete cascade,
  source_column_id uuid references public.entity_design_columns(id) on delete set null,
  source_column_name text not null,
  target_table_id uuid not null references public.entity_design_tables(id) on delete cascade,
  target_column_id uuid references public.entity_design_columns(id) on delete set null,
  target_column_name text not null default 'id',
  relation_type text not null default 'many_to_one'
    check (relation_type in ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')),
  is_enforced boolean not null default false,
  constraint_name text,
  on_delete text not null default 'no action'
    check (on_delete in ('no action', 'restrict', 'cascade', 'set null')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (source_table_id, source_column_name, target_table_id, target_column_name)
);

drop trigger if exists set_entity_design_relations_updated_at on public.entity_design_relations;
create trigger set_entity_design_relations_updated_at
before update on public.entity_design_relations
for each row
execute function public.set_updated_at();

alter table public.entity_design_tables enable row level security;
alter table public.entity_design_columns enable row level security;
alter table public.entity_design_relations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'entity_design_tables'
      and policyname = 'Admin users can manage entity design tables'
  ) then
    create policy "Admin users can manage entity design tables" on public.entity_design_tables
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
      and tablename = 'entity_design_columns'
      and policyname = 'Admin users can manage entity design columns'
  ) then
    create policy "Admin users can manage entity design columns" on public.entity_design_columns
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
      and tablename = 'entity_design_relations'
      and policyname = 'Admin users can manage entity design relations'
  ) then
    create policy "Admin users can manage entity design relations" on public.entity_design_relations
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

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values (
  'entity.design.manage',
  'Manage Entity Designer',
  'Design database table metadata, columns, and relationships.',
  'entity',
  'entity_design_tables',
  'manage',
  'active',
  45
) on conflict (code) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code = 'entity.design.manage'
where roles.code in ('system_admin', 'operations_admin', 'teaching_manager')
on conflict do nothing;

insert into public.admin_entities (
  code,
  title,
  table_name,
  route_path,
  description,
  primary_key,
  status,
  sort_order,
  schema
) values (
  'entity_design_tables',
  'Entity Table Designer',
  'public.entity_design_tables',
  '/dashboard/entity-design',
  'Metadata registry for visual table and column design.',
  'id',
  'active',
  55,
  '{}'::jsonb
) on conflict (code) do nothing;

insert into public.admin_routes (
  code,
  title,
  path,
  route_type,
  icon,
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
) values (
  'entity-design',
  'Entity Designer',
  '/dashboard/entity-design',
  'page',
  'database-2',
  'entity.design.manage',
  true,
  true,
  'dashboard',
  'active',
  25,
  '{"group":"business-root"}'::jsonb
) on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

update public.admin_routes child
set parent_id = parent.id,
    updated_at = timezone('utc'::text, now())
from public.admin_routes parent
where child.code = 'entity-design'
  and parent.code = 'business-root';
