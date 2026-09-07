-- Switch user-facing permission data away from public.users.role.

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
    'workflow.definitions.manage',
    'Manage Workflow Definitions',
    'Create and maintain workflow models and published definitions.',
    'entity',
    'workflow_definitions',
    'manage',
    'active',
    70
  ),
  (
    'workflow.runtime.manage',
    'Manage Workflow Runtime',
    'Inspect and maintain workflow process instances, tasks, variables, and history.',
    'entity',
    'workflow_runtime',
    'manage',
    'active',
    80
  ),
  (
    'workflow.tasks.manage',
    'Manage Workflow Task Center',
    'Manage workflow comments, CC entries, and task-center records.',
    'entity',
    'workflow_task_center',
    'manage',
    'active',
    90
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

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
    'User Permission Profiles',
    'public.get_admin_user_permission_rows',
    '/dashboard/system/users',
    'User list fields resolved from app roles, permissions, and Basejump account memberships.',
    'user_id',
    'active',
    10,
    '{}'::jsonb
  )
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.admin_user_roles (user_id, role_id)
select users.id, roles.id
from public.users
join public.admin_roles roles on roles.code = 'system_admin'
where users.role = 'admin'
on conflict (user_id, role_id) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code in (
  'admin.roles.manage',
  'admin.permissions.manage',
  'admin.routes.manage',
  'admin.entities.manage',
  'admin.users.manage',
  'lowcode.pages.manage',
  'workflow.definitions.manage',
  'workflow.runtime.manage',
  'workflow.tasks.manage'
)
where roles.code = 'system_admin'
on conflict do nothing;

create or replace function public.current_user_permission_codes()
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct permissions.code order by permissions.code), '{}'::text[])
  from public.admin_user_roles user_roles
  join public.admin_roles roles on roles.id = user_roles.role_id
  join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
  join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
  where user_roles.user_id = auth.uid()
    and roles.status = 'active'
    and permissions.status = 'active';
$$;

grant execute on function public.current_user_permission_codes() to authenticated;

create or replace function public.has_app_permission(permission_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
    join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
    where user_roles.user_id = auth.uid()
      and roles.status = 'active'
      and permissions.status = 'active'
      and permissions.code = has_app_permission.permission_code
  );
$$;

grant execute on function public.has_app_permission(text) to authenticated;

create or replace function public.get_admin_user_permission_rows()
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  nickname text,
  legacy_profile_role text,
  updated_at timestamp with time zone,
  app_role_codes text[],
  app_role_names text,
  role_codes text[],
  role_names text,
  permission_codes text[],
  permission_names text,
  permission_count integer,
  account_ids uuid[],
  account_names text,
  account_roles text[],
  account_count integer,
  personal_account_id uuid,
  personal_account_name text,
  is_primary_account_owner boolean
)
language plpgsql
security definer
stable
set search_path = public, basejump
as $$
begin
  if not public.has_app_permission('admin.users.manage') then
    raise exception 'Admin users permission required';
  end if;

  return query
  with role_summary as (
    select
      user_roles.user_id,
      array_agg(distinct roles.code order by roles.code) as role_codes,
      string_agg(distinct roles.name, ', ' order by roles.name) as role_names
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    where roles.status = 'active'
    group by user_roles.user_id
  ),
  permission_summary as (
    select
      user_roles.user_id,
      array_agg(distinct permissions.code order by permissions.code) as permission_codes,
      string_agg(distinct permissions.name, ', ' order by permissions.name) as permission_names,
      count(distinct permissions.id)::integer as permission_count
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
    join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
    where roles.status = 'active'
      and permissions.status = 'active'
    group by user_roles.user_id
  ),
  account_summary as (
    select
      memberships.user_id,
      array_agg(accounts.id order by accounts.personal_account desc, accounts.created_at asc) as account_ids,
      string_agg(
        coalesce(accounts.name, accounts.slug, accounts.id::text),
        ', '
        order by accounts.personal_account desc, accounts.created_at asc
      ) as account_names,
      array_agg(distinct memberships.account_role::text order by memberships.account_role::text) as account_roles,
      count(*)::integer as account_count,
      (array_agg(accounts.id order by accounts.created_at asc) filter (where accounts.personal_account))[1] as personal_account_id,
      (array_agg(accounts.name order by accounts.created_at asc) filter (where accounts.personal_account))[1] as personal_account_name,
      bool_or(accounts.primary_owner_user_id = memberships.user_id) as is_primary_account_owner
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    group by memberships.user_id
  )
  select
    users.id,
    users.id as user_id,
    auth_users.email::text,
    users.full_name,
    users.avatar_url,
    users.phone,
    users.nickname,
    users.role as legacy_profile_role,
    users.updated_at,
    coalesce(role_summary.role_codes, '{}'::text[]) as app_role_codes,
    coalesce(role_summary.role_names, '') as app_role_names,
    coalesce(role_summary.role_codes, '{}'::text[]) as role_codes,
    coalesce(role_summary.role_names, '') as role_names,
    coalesce(permission_summary.permission_codes, '{}'::text[]) as permission_codes,
    coalesce(permission_summary.permission_names, '') as permission_names,
    coalesce(permission_summary.permission_count, 0) as permission_count,
    coalesce(account_summary.account_ids, '{}'::uuid[]) as account_ids,
    coalesce(account_summary.account_names, '') as account_names,
    coalesce(account_summary.account_roles, '{}'::text[]) as account_roles,
    coalesce(account_summary.account_count, 0) as account_count,
    account_summary.personal_account_id,
    account_summary.personal_account_name,
    coalesce(account_summary.is_primary_account_owner, false) as is_primary_account_owner
  from public.users users
  left join auth.users auth_users on auth_users.id = users.id
  left join role_summary on role_summary.user_id = users.id
  left join permission_summary on permission_summary.user_id = users.id
  left join account_summary on account_summary.user_id = users.id
  order by users.updated_at desc nulls last, auth_users.created_at desc;
end;
$$;

grant execute on function public.get_admin_user_permission_rows() to authenticated;

drop policy if exists "Admin users can manage admin roles" on public.admin_roles;
drop policy if exists "Admin users can manage admin permissions" on public.admin_permissions;
drop policy if exists "Admin users can manage role permissions" on public.admin_role_permissions;
drop policy if exists "Admin users can manage user roles" on public.admin_user_roles;
drop policy if exists "Admin users can manage admin routes" on public.admin_routes;
drop policy if exists "Admin users can manage admin entities" on public.admin_entities;
drop policy if exists "Admin users can manage low-code pages" on public.lowcode_pages;
drop policy if exists "Admin users can manage page versions" on public.lowcode_page_versions;

do $$
declare
  workflow_definition_table text;
  workflow_runtime_table text;
  workflow_task_table text;
begin
  foreach workflow_definition_table in array array[
    'wf_model',
    'wf_model_version',
    'wf_process_definition',
    'wf_node_definition',
    'wf_edge_definition'
  ]
  loop
    if to_regclass(format('public.%I', workflow_definition_table)) is not null then
      execute format('drop policy if exists "Admin users can manage workflow models" on public.%I', workflow_definition_table);
      execute format('drop policy if exists "Admin users can manage workflow model versions" on public.%I', workflow_definition_table);
      execute format('drop policy if exists "Admin users can manage workflow definitions" on public.%I', workflow_definition_table);
      execute format('drop policy if exists "Admin users can manage workflow node definitions" on public.%I', workflow_definition_table);
      execute format('drop policy if exists "Admin users can manage workflow edge definitions" on public.%I', workflow_definition_table);
      execute format('drop policy if exists "Permission holders can manage workflow definitions" on public.%I', workflow_definition_table);
      execute format(
        'create policy "Permission holders can manage workflow definitions" on public.%I
          for all
          using (public.has_app_permission(''workflow.definitions.manage''))
          with check (public.has_app_permission(''workflow.definitions.manage''))',
        workflow_definition_table
      );
    end if;
  end loop;

  foreach workflow_runtime_table in array array[
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
    if to_regclass(format('public.%I', workflow_runtime_table)) is not null then
      execute format('drop policy if exists "Admin users can manage workflow runtime" on public.%I', workflow_runtime_table);
      execute format('drop policy if exists "Permission holders can manage workflow runtime" on public.%I', workflow_runtime_table);
      execute format(
        'create policy "Permission holders can manage workflow runtime" on public.%I
          for all
          using (public.has_app_permission(''workflow.runtime.manage''))
          with check (public.has_app_permission(''workflow.runtime.manage''))',
        workflow_runtime_table
      );
    end if;
  end loop;

  foreach workflow_task_table in array array['wf_comment', 'wf_cc']
  loop
    if to_regclass(format('public.%I', workflow_task_table)) is not null then
      execute format('drop policy if exists "Admin users can manage workflow task center" on public.%I', workflow_task_table);
      execute format('drop policy if exists "Permission holders can manage workflow task center" on public.%I', workflow_task_table);
      execute format(
        'create policy "Permission holders can manage workflow task center" on public.%I
          for all
          using (public.has_app_permission(''workflow.tasks.manage''))
          with check (public.has_app_permission(''workflow.tasks.manage''))',
        workflow_task_table
      );
    end if;
  end loop;
end $$;

select pg_notify('pgrst', 'reload schema');
