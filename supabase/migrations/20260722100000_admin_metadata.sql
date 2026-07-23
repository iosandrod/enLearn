-- Admin metadata tables for role/permission/route/entity management.

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_admin_roles_updated_at on public.admin_roles;
create trigger set_admin_roles_updated_at
before update on public.admin_roles
for each row
execute function public.set_updated_at();

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'Admin users can manage admin roles'
  ) then
    create policy "Admin users can manage admin roles" on public.admin_roles
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

create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  resource_type text not null default 'page'
    check (resource_type in ('page', 'route', 'entity', 'api', 'menu', 'action')),
  resource_key text,
  action_code text,
  route_path text,
  page_code text references public.lowcode_pages(code) on delete set null,
  entity_code text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_admin_permissions_updated_at on public.admin_permissions;
create trigger set_admin_permissions_updated_at
before update on public.admin_permissions
for each row
execute function public.set_updated_at();

alter table public.admin_permissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_permissions'
      and policyname = 'Admin users can manage admin permissions'
  ) then
    create policy "Admin users can manage admin permissions" on public.admin_permissions
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

create table if not exists public.admin_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (role_id, permission_id)
);

alter table public.admin_role_permissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_role_permissions'
      and policyname = 'Admin users can manage role permissions'
  ) then
    create policy "Admin users can manage role permissions" on public.admin_role_permissions
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

create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, role_id)
);

alter table public.admin_user_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_user_roles'
      and policyname = 'Admin users can manage user roles'
  ) then
    create policy "Admin users can manage user roles" on public.admin_user_roles
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

create table if not exists public.admin_routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  path text not null unique,
  parent_id uuid references public.admin_routes(id) on delete set null,
  route_type text not null default 'page'
    check (route_type in ('group', 'page', 'link')),
  icon text,
  page_code text references public.lowcode_pages(code) on delete set null,
  permission_code text references public.admin_permissions(code) on delete set null,
  visible boolean not null default true,
  keep_alive boolean not null default true,
  layout text not null default 'dashboard'
    check (layout in ('default', 'dashboard', 'blank')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_admin_routes_updated_at on public.admin_routes;
create trigger set_admin_routes_updated_at
before update on public.admin_routes
for each row
execute function public.set_updated_at();

alter table public.admin_routes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_routes'
      and policyname = 'Admin users can manage admin routes'
  ) then
    create policy "Admin users can manage admin routes" on public.admin_routes
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

create table if not exists public.admin_entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  table_name text not null unique,
  route_path text not null unique,
  page_code text references public.lowcode_pages(code) on delete set null,
  icon text,
  description text,
  primary_key text not null default 'id',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  schema jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_admin_entities_updated_at on public.admin_entities;
create trigger set_admin_entities_updated_at
before update on public.admin_entities
for each row
execute function public.set_updated_at();

alter table public.admin_entities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_entities'
      and policyname = 'Admin users can manage admin entities'
  ) then
    create policy "Admin users can manage admin entities" on public.admin_entities
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
) values
  (
    'admin.roles.manage',
    'Manage Roles',
    'Create, update, and delete backend roles.',
    'entity',
    'admin_roles',
    'manage',
    'active',
    10
  ),
  (
    'admin.permissions.manage',
    'Manage Permissions',
    'Create, update, and delete permissions.',
    'entity',
    'admin_permissions',
    'manage',
    'active',
    20
  ),
  (
    'admin.routes.manage',
    'Manage Routes',
    'Create, update, and delete dynamic routes.',
    'route',
    'admin_routes',
    'manage',
    'active',
    30
  ),
  (
    'admin.entities.manage',
    'Manage Entities',
    'Create, update, and delete entity metadata.',
    'entity',
    'admin_entities',
    'manage',
    'active',
    40
  ),
  (
    'admin.users.manage',
    'Manage User Roles',
    'Assign backend roles to users.',
    'entity',
    'public.users',
    'manage',
    'active',
    50
  ),
  (
    'lowcode.pages.manage',
    'Manage Low-Code Pages',
    'Create and maintain low-code page metadata.',
    'page',
    'lowcode_pages',
    'manage',
    'active',
    60
  )
on conflict (code) do nothing;

insert into public.admin_roles (
  code,
  name,
  description,
  status,
  sort_order,
  is_system
) values
  (
    'system_admin',
    'System Admin',
    'Full access to every admin and low-code screen.',
    'active',
    10,
    true
  ),
  (
    'operations_admin',
    'Operations Admin',
    'Manage routes, entities, and low-code pages.',
    'active',
    20,
    false
  ),
  (
    'consultant_manager',
    'Consultant Manager',
    'Manage users and trial conversion workflows.',
    'active',
    30,
    false
  ),
  (
    'teaching_manager',
    'Teaching Manager',
    'Manage learning content and classroom-facing pages.',
    'active',
    40,
    false
  )
on conflict (code) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'admin.roles.manage',
  'admin.permissions.manage',
  'admin.routes.manage',
  'admin.entities.manage',
  'admin.users.manage',
  'lowcode.pages.manage'
)
where roles.code = 'system_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'admin.routes.manage',
  'admin.entities.manage',
  'lowcode.pages.manage'
)
where roles.code = 'operations_admin'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'admin.users.manage',
  'lowcode.pages.manage'
)
where roles.code = 'consultant_manager'
on conflict do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'admin.users.manage',
  'lowcode.pages.manage',
  'admin.entities.manage'
)
where roles.code = 'teaching_manager'
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
) values
  (
    'users',
    'Users',
    'public.users',
    '/dashboard/system/users',
    'User role assignment and profile registry.',
    'id',
    'active',
    10,
    '{}'::jsonb
  ),
  (
    'admin_roles',
    'Admin Roles',
    'public.admin_roles',
    '/dashboard/system/roles',
    'Backend role definitions and permission bindings.',
    'id',
    'active',
    20,
    '{}'::jsonb
  ),
  (
    'admin_permissions',
    'Admin Permissions',
    'public.admin_permissions',
    '/dashboard/system/permissions',
    'Permission registry for routes and entities.',
    'id',
    'active',
    30,
    '{}'::jsonb
  ),
  (
    'admin_routes',
    'Admin Routes',
    'public.admin_routes',
    '/dashboard/system/routes',
    'Dynamic route and menu registry.',
    'id',
    'active',
    40,
    '{}'::jsonb
  ),
  (
    'admin_entities',
    'Admin Entities',
    'public.admin_entities',
    '/dashboard/system/entities',
    'Entity metadata registry for low-code CRUD screens.',
    'id',
    'active',
    50,
    '{}'::jsonb
  ),
  (
    'lowcode_pages',
    'Low-Code Pages',
    'public.lowcode_pages',
    '/dashboard/low-code',
    'Database-backed page definitions rendered by the low-code studio.',
    'id',
    'active',
    60,
    '{}'::jsonb
  )
on conflict (code) do nothing;
