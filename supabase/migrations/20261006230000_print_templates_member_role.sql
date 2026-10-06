begin;

-- The member role is a global application role because print_templates is a
-- shared table and its RLS policy checks global admin_user_roles entries.
insert into public.admin_roles (
  code,
  name,
  description,
  status,
  sort_order,
  is_system
)
values (
  'member',
  'Member',
  'Default member access for shared application resources.',
  'active',
  100,
  false
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  sort_order = excluded.sort_order;

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  route_path,
  page_code,
  entity_code,
  status,
  sort_order
)
values (
  'print.templates.manage',
  'Manage Print Templates',
  'Create and maintain print design templates.',
  'entity',
  'print_templates',
  'manage',
  '/dashboard/print/templates',
  'print-templates',
  'print_templates',
  'active',
  80
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  entity_code = excluded.entity_code,
  status = excluded.status,
  sort_order = excluded.sort_order;

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
cross join public.admin_permissions permissions
where roles.code = 'member'
  and permissions.code = 'print.templates.manage'
on conflict (role_id, permission_id) do nothing;

create or replace function public.assign_signup_member_role()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  member_role_id uuid;
begin
  select roles.id
  into member_role_id
  from public.admin_roles roles
  where roles.code = 'member'
    and roles.status = 'active';

  if member_role_id is not null then
    insert into public.admin_user_roles (user_id, role_id, account_id)
    select new.id, member_role_id, null
    where not exists (
      select 1
      from public.admin_user_roles existing
      where existing.user_id = new.id
        and existing.role_id = member_role_id
        and existing.account_id is null
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_member_role on auth.users;
create trigger on_auth_user_member_role
after insert on auth.users
for each row execute function public.assign_signup_member_role();

-- Backfill every existing auth user once. The NOT EXISTS clause keeps this
-- migration safe to rerun even though admin_user_roles has no composite key.
insert into public.admin_user_roles (user_id, role_id, account_id)
select users.id, roles.id, null
from auth.users users
cross join public.admin_roles roles
where roles.code = 'member'
  and not exists (
    select 1
    from public.admin_user_roles existing
    where existing.user_id = users.id
      and existing.role_id = roles.id
      and existing.account_id is null
  );

-- Keep new registrations aligned with the backfill. AuthService calls this
-- security-definer function after creating the Supabase Auth user.
create or replace function public.assign_signup_default_account(
  login_user_id uuid,
  preferred_account_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'basejump'
as $function$
declare
  selected_account basejump.accounts%rowtype;
  member_role_id uuid;
begin
  select accounts.*
  into selected_account
  from basejump.accounts accounts
  where accounts.personal_account = false
    and accounts.status = 'active'
  order by (accounts.id = preferred_account_id) desc, accounts.created_at asc
  limit 1;

  if selected_account.id is null then
    raise exception 'No active account set is available';
  end if;

  insert into basejump.account_user (account_id, user_id, account_role)
  values (selected_account.id, login_user_id, 'member'::basejump.account_role)
  on conflict (user_id, account_id) do nothing;

  insert into public.account_user_preferences (
    user_id, default_account_id, last_account_id, last_login_at, updated_at
  ) values (
    login_user_id,
    selected_account.id,
    selected_account.id,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict (user_id) do update set
    default_account_id = excluded.default_account_id,
    last_account_id = excluded.last_account_id,
    updated_at = excluded.updated_at;

  select roles.id
  into member_role_id
  from public.admin_roles roles
  where roles.code = 'member'
    and roles.status = 'active';

  if member_role_id is null then
    raise exception 'Default member role is not configured';
  end if;

  insert into public.admin_user_roles (user_id, role_id, account_id)
  select login_user_id, member_role_id, null
  where not exists (
    select 1
    from public.admin_user_roles existing
    where existing.user_id = login_user_id
      and existing.role_id = member_role_id
      and existing.account_id is null
  );

  return json_build_object(
    'account_id', selected_account.id,
    'account_role', 'member',
    'is_primary_owner', selected_account.primary_owner_user_id = login_user_id,
    'name', selected_account.name,
    'slug', selected_account.slug,
    'code', selected_account.code,
    'status', selected_account.status,
    'base_currency', selected_account.base_currency,
    'timezone', selected_account.timezone,
    'fiscal_year_start_month', selected_account.fiscal_year_start_month,
    'is_default', true,
    'is_last_used', true
  );
end;
$function$;

commit;
