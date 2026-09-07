-- Basejump-style account membership and permission helpers for EnLearn.

create extension if not exists pgcrypto;

create schema if not exists basejump;
grant usage on schema basejump to authenticated;
grant usage on schema basejump to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_role'
      and n.nspname = 'basejump'
  ) then
    create type basejump.account_role as enum ('owner', 'member');
  end if;
end $$;

create table if not exists basejump.config (
  singleton boolean primary key default true check (singleton),
  enable_team_accounts boolean not null default true,
  enable_personal_account_billing boolean not null default false,
  enable_team_account_billing boolean not null default false,
  billing_provider text not null default 'stripe'
);

insert into basejump.config (
  singleton,
  enable_team_accounts,
  enable_personal_account_billing,
  enable_team_account_billing
) values (
  true,
  true,
  false,
  false
)
on conflict (singleton) do nothing;

grant select on basejump.config to authenticated, service_role;
alter table basejump.config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'config'
      and policyname = 'Basejump settings can be read by authenticated users'
  ) then
    create policy "Basejump settings can be read by authenticated users"
      on basejump.config
      for select
      to authenticated
      using (true);
  end if;
end $$;

create or replace function basejump.get_config()
returns json
language sql
stable
as $$
  select row_to_json(config)
  from basejump.config
  limit 1;
$$;

grant execute on function basejump.get_config() to authenticated, service_role;

create or replace function basejump.is_set(field_name text)
returns boolean
language plpgsql
stable
as $$
declare
  result boolean;
begin
  execute format('select %I from basejump.config limit 1', field_name) into result;
  return coalesce(result, false);
end;
$$;

grant execute on function basejump.is_set(text) to authenticated;

create or replace function basejump.trigger_set_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = coalesce(new.created_at, timezone('utc'::text, now()));
    new.updated_at = coalesce(new.updated_at, timezone('utc'::text, now()));
  else
    new.created_at = old.created_at;
    new.updated_at = timezone('utc'::text, now());
  end if;

  return new;
end;
$$;

create or replace function basejump.trigger_set_user_tracking()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
    new.updated_by = coalesce(new.updated_by, auth.uid());
  else
    new.created_by = old.created_by;
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function basejump.generate_token(token_length int)
returns text
language sql
as $$
  select encode(gen_random_bytes(token_length)::bytea, 'hex');
$$;

grant execute on function basejump.generate_token(int) to authenticated;

create table if not exists basejump.accounts (
  id uuid primary key default gen_random_uuid(),
  primary_owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text,
  slug text unique,
  personal_account boolean not null default false,
  private_metadata jsonb not null default '{}'::jsonb,
  public_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  constraint basejump_accounts_slug_required_for_team check (
    (personal_account = true and slug is null)
    or (personal_account = false and slug is not null)
  )
);

grant select, insert, update, delete on basejump.accounts to authenticated, service_role;
alter table basejump.accounts enable row level security;

create or replace function basejump.protect_account_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id <> old.id
      or new.personal_account <> old.personal_account
      or new.primary_owner_user_id <> old.primary_owner_user_id
    then
      raise exception 'You do not have permission to update this field';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists basejump_protect_account_fields on basejump.accounts;
create trigger basejump_protect_account_fields
before update on basejump.accounts
for each row
execute function basejump.protect_account_fields();

create or replace function basejump.slugify_account_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is not null then
    new.slug = lower(regexp_replace(new.slug, '[^a-zA-Z0-9-]+', '-', 'g'));
  end if;

  return new;
end;
$$;

drop trigger if exists basejump_slugify_account_slug on basejump.accounts;
create trigger basejump_slugify_account_slug
before insert or update on basejump.accounts
for each row
execute function basejump.slugify_account_slug();

drop trigger if exists basejump_set_accounts_timestamp on basejump.accounts;
create trigger basejump_set_accounts_timestamp
before insert or update on basejump.accounts
for each row
execute function basejump.trigger_set_timestamps();

drop trigger if exists basejump_set_accounts_user_tracking on basejump.accounts;
create trigger basejump_set_accounts_user_tracking
before insert or update on basejump.accounts
for each row
execute function basejump.trigger_set_user_tracking();

create table if not exists basejump.account_user (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  account_role basejump.account_role not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (user_id, account_id)
);

grant select, insert, update, delete on basejump.account_user to authenticated, service_role;
alter table basejump.account_user enable row level security;

create or replace function basejump.add_current_user_to_new_account()
returns trigger
language plpgsql
security definer
set search_path = public, basejump
as $$
begin
  if new.primary_owner_user_id = auth.uid() then
    insert into basejump.account_user (account_id, user_id, account_role)
    values (new.id, auth.uid(), 'owner')
    on conflict (user_id, account_id) do update
      set account_role = excluded.account_role;
  end if;

  return new;
end;
$$;

drop trigger if exists basejump_add_current_user_to_new_account on basejump.accounts;
create trigger basejump_add_current_user_to_new_account
after insert on basejump.accounts
for each row
execute function basejump.add_current_user_to_new_account();

create or replace function basejump.run_new_user_setup()
returns trigger
language plpgsql
security definer
set search_path = public, basejump
as $$
declare
  generated_user_name text;
begin
  generated_user_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Personal Account'
  );

  insert into basejump.accounts (
    id,
    primary_owner_user_id,
    name,
    personal_account
  ) values (
    new.id,
    new.id,
    generated_user_name,
    true
  )
  on conflict (id) do update
    set name = coalesce(basejump.accounts.name, excluded.name);

  insert into basejump.account_user (account_id, user_id, account_role)
  values (new.id, new.id, 'owner')
  on conflict (user_id, account_id) do update
    set account_role = excluded.account_role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_basejump_account on auth.users;
create trigger on_auth_user_created_basejump_account
after insert on auth.users
for each row
execute function basejump.run_new_user_setup();

create or replace function basejump.has_role_on_account(
  account_id uuid,
  account_role basejump.account_role default null
)
returns boolean
language sql
security definer
set search_path = public, basejump
as $$
  select exists(
    select 1
    from basejump.account_user au
    where au.user_id = auth.uid()
      and au.account_id = has_role_on_account.account_id
      and (
        au.account_role = has_role_on_account.account_role
        or has_role_on_account.account_role is null
      )
  );
$$;

grant execute on function basejump.has_role_on_account(uuid, basejump.account_role) to authenticated;

create or replace function basejump.get_accounts_with_role(
  passed_in_role basejump.account_role default null
)
returns setof uuid
language sql
security definer
set search_path = public, basejump
as $$
  select au.account_id
  from basejump.account_user au
  where au.user_id = auth.uid()
    and (
      au.account_role = passed_in_role
      or passed_in_role is null
    );
$$;

grant execute on function basejump.get_accounts_with_role(basejump.account_role) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'account_user'
      and policyname = 'Users can view their own account memberships'
  ) then
    create policy "Users can view their own account memberships"
      on basejump.account_user
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'account_user'
      and policyname = 'Users can view teammates on shared accounts'
  ) then
    create policy "Users can view teammates on shared accounts"
      on basejump.account_user
      for select
      to authenticated
      using (basejump.has_role_on_account(account_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'account_user'
      and policyname = 'Account members can be removed by owners'
  ) then
    create policy "Account members can be removed by owners"
      on basejump.account_user
      for delete
      to authenticated
      using (
        basejump.has_role_on_account(account_id, 'owner')
        and user_id <> (
          select accounts.primary_owner_user_id
          from basejump.accounts
          where accounts.id = account_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'accounts'
      and policyname = 'Accounts are viewable by members'
  ) then
    create policy "Accounts are viewable by members"
      on basejump.accounts
      for select
      to authenticated
      using (basejump.has_role_on_account(id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'accounts'
      and policyname = 'Accounts are viewable by primary owner'
  ) then
    create policy "Accounts are viewable by primary owner"
      on basejump.accounts
      for select
      to authenticated
      using (primary_owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'accounts'
      and policyname = 'Team accounts can be created by any authenticated user'
  ) then
    create policy "Team accounts can be created by any authenticated user"
      on basejump.accounts
      for insert
      to authenticated
      with check (
        basejump.is_set('enable_team_accounts')
        and personal_account = false
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'basejump'
      and tablename = 'accounts'
      and policyname = 'Accounts can be edited by owners'
  ) then
    create policy "Accounts can be edited by owners"
      on basejump.accounts
      for update
      to authenticated
      using (basejump.has_role_on_account(id, 'owner'))
      with check (basejump.has_role_on_account(id, 'owner'));
  end if;
end $$;

create or replace function public.get_account_id(slug text)
returns uuid
language sql
stable
as $$
  select accounts.id
  from basejump.accounts
  where accounts.slug = get_account_id.slug;
$$;

grant execute on function public.get_account_id(text) to authenticated, service_role;

create or replace function public.current_user_account_role(account_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  response jsonb;
begin
  select jsonb_build_object(
    'account_role', au.account_role,
    'is_primary_owner', accounts.primary_owner_user_id = auth.uid(),
    'is_personal_account', accounts.personal_account
  )
  into response
  from basejump.account_user au
  join basejump.accounts on accounts.id = au.account_id
  where au.user_id = auth.uid()
    and au.account_id = current_user_account_role.account_id;

  if response ->> 'account_role' is null then
    raise exception 'Not found';
  end if;

  return response;
end;
$$;

grant execute on function public.current_user_account_role(uuid) to authenticated;

create or replace function public.get_accounts()
returns json
language sql
stable
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'account_id', au.account_id,
        'account_role', au.account_role,
        'is_primary_owner', accounts.primary_owner_user_id = auth.uid(),
        'name', accounts.name,
        'slug', accounts.slug,
        'personal_account', accounts.personal_account,
        'metadata', accounts.public_metadata,
        'created_at', accounts.created_at,
        'updated_at', accounts.updated_at
      )
      order by accounts.personal_account desc, accounts.created_at asc
    ),
    '[]'::json
  )
  from basejump.account_user au
  join basejump.accounts on accounts.id = au.account_id
  where au.user_id = auth.uid();
$$;

grant execute on function public.get_accounts() to authenticated;

create or replace function public.get_account(account_id uuid)
returns json
language plpgsql
stable
as $$
begin
  if current_user in ('anon', 'authenticated')
    and not basejump.has_role_on_account(get_account.account_id)
  then
    raise exception 'You must be a member of an account to access it';
  end if;

  return (
    select json_build_object(
      'account_id', accounts.id,
      'account_role', au.account_role,
      'is_primary_owner', accounts.primary_owner_user_id = auth.uid(),
      'name', accounts.name,
      'slug', accounts.slug,
      'personal_account', accounts.personal_account,
      'billing_enabled', false,
      'billing_status', null,
      'metadata', accounts.public_metadata,
      'created_at', accounts.created_at,
      'updated_at', accounts.updated_at
    )
    from basejump.accounts
    left join basejump.account_user au
      on au.account_id = accounts.id
      and au.user_id = auth.uid()
    where accounts.id = get_account.account_id
  );
end;
$$;

grant execute on function public.get_account(uuid) to authenticated, service_role;

create or replace function public.get_account_by_slug(slug text)
returns json
language plpgsql
stable
as $$
declare
  internal_account_id uuid;
begin
  select accounts.id
  into internal_account_id
  from basejump.accounts
  where accounts.slug is not null
    and accounts.slug = get_account_by_slug.slug;

  return public.get_account(internal_account_id);
end;
$$;

grant execute on function public.get_account_by_slug(text) to authenticated;

create or replace function public.get_personal_account()
returns json
language plpgsql
stable
as $$
begin
  return public.get_account(auth.uid());
end;
$$;

grant execute on function public.get_personal_account() to authenticated;

create or replace function public.create_account(slug text default null, name text default null)
returns json
language plpgsql
as $$
declare
  new_account_id uuid;
begin
  insert into basejump.accounts (slug, name, personal_account)
  values (create_account.slug, create_account.name, false)
  returning id into new_account_id;

  return public.get_account(new_account_id);
exception
  when unique_violation then
    raise exception 'An account with that slug already exists';
end;
$$;

grant execute on function public.create_account(text, text) to authenticated;

create or replace function public.update_account(
  account_id uuid,
  slug text default null,
  name text default null,
  public_metadata jsonb default null,
  replace_metadata boolean default false
)
returns json
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
    and not basejump.has_role_on_account(update_account.account_id, 'owner')
  then
    raise exception 'Only account owners can update an account';
  end if;

  update basejump.accounts accounts
  set
    slug = coalesce(update_account.slug, accounts.slug),
    name = coalesce(update_account.name, accounts.name),
    public_metadata = case
      when update_account.public_metadata is null then accounts.public_metadata
      when update_account.replace_metadata then update_account.public_metadata
      else accounts.public_metadata || update_account.public_metadata
    end
  where accounts.id = update_account.account_id;

  return public.get_account(update_account.account_id);
end;
$$;

grant execute on function public.update_account(uuid, text, text, jsonb, boolean) to authenticated, service_role;

create or replace function public.get_account_members(
  account_id uuid,
  results_limit integer default 50,
  results_offset integer default 0
)
returns json
language plpgsql
security definer
set search_path = public, basejump
as $$
begin
  if public.current_user_account_role(get_account_members.account_id) ->> 'account_role' <> 'owner' then
    raise exception 'Only account owners can access this function';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'user_id', au.user_id,
          'account_role', au.account_role,
          'name', coalesce(profiles.full_name, personal_accounts.name),
          'email', auth_users.email,
          'is_primary_owner', accounts.primary_owner_user_id = au.user_id
        )
        order by accounts.primary_owner_user_id = au.user_id desc, auth_users.email asc
      )
      from basejump.account_user au
      join basejump.accounts on accounts.id = au.account_id
      left join public.users profiles on profiles.id = au.user_id
      left join basejump.accounts personal_accounts
        on personal_accounts.primary_owner_user_id = au.user_id
        and personal_accounts.personal_account = true
      left join auth.users auth_users on auth_users.id = au.user_id
      where au.account_id = get_account_members.account_id
      limit coalesce(get_account_members.results_limit, 50)
      offset coalesce(get_account_members.results_offset, 0)
    ),
    '[]'::json
  );
end;
$$;

grant execute on function public.get_account_members(uuid, integer, integer) to authenticated;

create or replace function public.add_account_member(
  account_id uuid,
  user_id uuid,
  account_role basejump.account_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = public, basejump
as $$
declare
  target_is_personal boolean;
begin
  if not basejump.has_role_on_account(add_account_member.account_id, 'owner') then
    raise exception 'Only account owners can add account members';
  end if;

  select accounts.personal_account
  into target_is_personal
  from basejump.accounts
  where accounts.id = add_account_member.account_id;

  if coalesce(target_is_personal, true) then
    raise exception 'Members cannot be added to personal accounts';
  end if;

  insert into basejump.account_user (account_id, user_id, account_role)
  values (
    add_account_member.account_id,
    add_account_member.user_id,
    add_account_member.account_role
  )
  on conflict (user_id, account_id) do update
    set account_role = excluded.account_role;
end;
$$;

grant execute on function public.add_account_member(uuid, uuid, basejump.account_role) to authenticated;

create or replace function public.update_account_user_role(
  account_id uuid,
  user_id uuid,
  new_account_role basejump.account_role,
  make_primary_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, basejump
as $$
declare
  is_account_owner boolean;
  is_account_primary_owner boolean;
  changing_primary_owner boolean;
begin
  select basejump.has_role_on_account(update_account_user_role.account_id, 'owner')
  into is_account_owner;

  if not is_account_owner then
    raise exception 'You must be an owner of the account to update a user role';
  end if;

  select
    accounts.primary_owner_user_id = auth.uid(),
    accounts.primary_owner_user_id = update_account_user_role.user_id
  into is_account_primary_owner, changing_primary_owner
  from basejump.accounts
  where accounts.id = update_account_user_role.account_id;

  if changing_primary_owner and not is_account_primary_owner then
    raise exception 'You must be the primary owner of the account to change the primary owner';
  end if;

  update basejump.account_user au
  set account_role = update_account_user_role.new_account_role
  where au.account_id = update_account_user_role.account_id
    and au.user_id = update_account_user_role.user_id;

  if make_primary_owner then
    if not is_account_primary_owner then
      raise exception 'You must be the primary owner of the account to change the primary owner';
    end if;

    update basejump.accounts accounts
    set primary_owner_user_id = update_account_user_role.user_id
    where accounts.id = update_account_user_role.account_id;
  end if;
end;
$$;

grant execute on function public.update_account_user_role(uuid, uuid, basejump.account_role, boolean) to authenticated;

create or replace function public.remove_account_member(account_id uuid, user_id uuid)
returns void
language plpgsql
as $$
begin
  if not basejump.has_role_on_account(remove_account_member.account_id, 'owner') then
    raise exception 'Only account owners can remove account members';
  end if;

  delete from basejump.account_user au
  where au.account_id = remove_account_member.account_id
    and au.user_id = remove_account_member.user_id;
end;
$$;

grant execute on function public.remove_account_member(uuid, uuid) to authenticated;

insert into basejump.accounts (
  id,
  primary_owner_user_id,
  name,
  personal_account
)
select
  auth_users.id,
  auth_users.id,
  coalesce(
    nullif(auth_users.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(auth_users.email, ''), '@', 1), ''),
    'Personal Account'
  ),
  true
from auth.users auth_users
on conflict (id) do nothing;

insert into basejump.account_user (account_id, user_id, account_role)
select auth_users.id, auth_users.id, 'owner'::basejump.account_role
from auth.users auth_users
on conflict (user_id, account_id) do nothing;

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
  select coalesce(
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and users.role = 'admin'
    )
    or exists (
      select 1
      from public.admin_user_roles user_roles
      join public.admin_roles roles on roles.id = user_roles.role_id
      join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
      join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
      where user_roles.user_id = auth.uid()
        and roles.status = 'active'
        and permissions.status = 'active'
        and permissions.code = has_app_permission.permission_code
    ),
    false
  );
$$;

grant execute on function public.has_app_permission(text) to authenticated;

insert into public.admin_user_roles (user_id, role_id)
select users.id, roles.id
from public.users
join public.admin_roles roles on roles.code = 'system_admin'
where users.role = 'admin'
on conflict (user_id, role_id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'Permission holders can manage admin roles'
  ) then
    create policy "Permission holders can manage admin roles"
      on public.admin_roles
      for all
      using (public.has_app_permission('admin.roles.manage'))
      with check (public.has_app_permission('admin.roles.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_permissions'
      and policyname = 'Permission holders can manage admin permissions'
  ) then
    create policy "Permission holders can manage admin permissions"
      on public.admin_permissions
      for all
      using (public.has_app_permission('admin.permissions.manage'))
      with check (public.has_app_permission('admin.permissions.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_role_permissions'
      and policyname = 'Permission holders can manage role permissions'
  ) then
    create policy "Permission holders can manage role permissions"
      on public.admin_role_permissions
      for all
      using (public.has_app_permission('admin.roles.manage'))
      with check (public.has_app_permission('admin.roles.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_user_roles'
      and policyname = 'Permission holders can manage user roles'
  ) then
    create policy "Permission holders can manage user roles"
      on public.admin_user_roles
      for all
      using (public.has_app_permission('admin.users.manage'))
      with check (public.has_app_permission('admin.users.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_routes'
      and policyname = 'Authenticated users can read active route metadata'
  ) then
    create policy "Authenticated users can read active route metadata"
      on public.admin_routes
      for select
      to authenticated
      using (status = 'active');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_routes'
      and policyname = 'Permission holders can manage admin routes'
  ) then
    create policy "Permission holders can manage admin routes"
      on public.admin_routes
      for all
      using (public.has_app_permission('admin.routes.manage'))
      with check (public.has_app_permission('admin.routes.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_entities'
      and policyname = 'Permission holders can manage admin entities'
  ) then
    create policy "Permission holders can manage admin entities"
      on public.admin_entities
      for all
      using (public.has_app_permission('admin.entities.manage'))
      with check (public.has_app_permission('admin.entities.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lowcode_pages'
      and policyname = 'Permission holders can manage low-code pages'
  ) then
    create policy "Permission holders can manage low-code pages"
      on public.lowcode_pages
      for all
      using (public.has_app_permission('lowcode.pages.manage'))
      with check (public.has_app_permission('lowcode.pages.manage'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lowcode_page_versions'
      and policyname = 'Permission holders can manage low-code page versions'
  ) then
    create policy "Permission holders can manage low-code page versions"
      on public.lowcode_page_versions
      for all
      using (public.has_app_permission('lowcode.pages.manage'))
      with check (public.has_app_permission('lowcode.pages.manage'));
  end if;
end $$;
