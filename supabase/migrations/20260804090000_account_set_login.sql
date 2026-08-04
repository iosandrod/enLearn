-- ERP account-set selection, account-scoped roles, and tenant isolation.

alter table basejump.accounts
  add column if not exists code text,
  add column if not exists status text not null default 'active',
  add column if not exists base_currency text not null default 'CNY',
  add column if not exists timezone text not null default 'Asia/Shanghai',
  add column if not exists fiscal_year_start_month smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'basejump_accounts_status_check'
      and conrelid = 'basejump.accounts'::regclass
  ) then
    alter table basejump.accounts
      add constraint basejump_accounts_status_check
      check (status in ('active', 'inactive', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'basejump_accounts_fiscal_month_check'
      and conrelid = 'basejump.accounts'::regclass
  ) then
    alter table basejump.accounts
      add constraint basejump_accounts_fiscal_month_check
      check (fiscal_year_start_month between 1 and 12);
  end if;
end $$;

create or replace function basejump.normalize_account_set_fields()
returns trigger
language plpgsql
as $$
begin
  new.code := upper(coalesce(
    nullif(btrim(new.code), ''),
    case when new.personal_account then 'P' else 'A' end ||
      substr(replace(new.id::text, '-', ''), 1, 11)
  ));
  new.base_currency := upper(coalesce(nullif(btrim(new.base_currency), ''), 'CNY'));
  new.timezone := coalesce(nullif(btrim(new.timezone), ''), 'Asia/Shanghai');
  return new;
end;
$$;

drop trigger if exists basejump_normalize_account_set_fields on basejump.accounts;
create trigger basejump_normalize_account_set_fields
before insert or update on basejump.accounts
for each row execute function basejump.normalize_account_set_fields();

update basejump.accounts
set code = case when personal_account then 'P' else 'A' end ||
  substr(replace(id::text, '-', ''), 1, 11)
where code is null or btrim(code) = '';

create unique index if not exists basejump_accounts_code_key
  on basejump.accounts (upper(code));

do $$
declare
  owner_id uuid;
  default_account_id constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  select auth_users.id
  into owner_id
  from auth.users auth_users
  left join public.users profiles on profiles.id = auth_users.id
  order by (profiles.role = 'admin') desc, auth_users.created_at asc
  limit 1;

  if owner_id is not null then
    insert into basejump.accounts (
      id,
      primary_owner_user_id,
      name,
      slug,
      personal_account,
      code,
      status,
      base_currency,
      timezone,
      fiscal_year_start_month
    ) values (
      default_account_id,
      owner_id,
      '默认制造账套',
      'default-manufacturing',
      false,
      '001',
      'active',
      'CNY',
      'Asia/Shanghai',
      1
    )
    on conflict (id) do update set
      code = excluded.code,
      status = 'active';

    insert into basejump.account_user (account_id, user_id, account_role)
    select
      default_account_id,
      auth_users.id,
      case when auth_users.id = owner_id
        then 'owner'::basejump.account_role
        else 'member'::basejump.account_role
      end
    from auth.users auth_users
    on conflict (user_id, account_id) do update set
      account_role = excluded.account_role;

  end if;
end $$;

create table if not exists public.account_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_account_id uuid references basejump.accounts(id) on delete set null,
  last_account_id uuid references basejump.accounts(id) on delete set null,
  last_login_at timestamp with time zone,
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.account_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  logged_in_at timestamp with time zone not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_account_login_events_user_time
  on public.account_login_events (user_id, logged_in_at desc);
create index if not exists idx_account_login_events_account_time
  on public.account_login_events (account_id, logged_in_at desc);

alter table public.account_user_preferences enable row level security;
alter table public.account_login_events enable row level security;
grant select, insert, update, delete on public.account_user_preferences to authenticated, service_role;
grant select on public.account_login_events to authenticated;
grant select, insert, update, delete on public.account_login_events to service_role;

drop policy if exists "Users can manage own account preference" on public.account_user_preferences;
create policy "Users can manage own account preference"
on public.account_user_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can view own account login history" on public.account_login_events;
create policy "Users can view own account login history"
on public.account_login_events for select to authenticated
using (user_id = auth.uid());

alter table public.admin_user_roles
  add column if not exists account_id uuid references basejump.accounts(id) on delete cascade;

create table if not exists public.app_migration_markers (
  key text primary key,
  applied_at timestamp with time zone not null default timezone('utc'::text, now()),
  details jsonb not null default '{}'::jsonb
);

revoke all on table public.app_migration_markers from public, anon, authenticated;

alter table public.admin_user_roles
  drop constraint if exists admin_user_roles_user_id_role_id_key;

create unique index if not exists admin_user_roles_global_key
  on public.admin_user_roles (user_id, role_id)
  where account_id is null;
create unique index if not exists admin_user_roles_account_key
  on public.admin_user_roles (user_id, role_id, account_id)
  where account_id is not null;
create index if not exists idx_admin_user_roles_account_user
  on public.admin_user_roles (account_id, user_id);

do $$
declare
  marker_key constant text := '20260804090000_scope_legacy_admin_user_roles';
  migrated_count integer := 0;
begin
  if not exists (
    select 1 from public.app_migration_markers where key = marker_key
  ) then
    update public.admin_user_roles
    set account_id = '00000000-0000-4000-8000-000000000001'::uuid
    where account_id is null
      and exists (
        select 1
        from basejump.accounts
        where id = '00000000-0000-4000-8000-000000000001'::uuid
      );

    get diagnostics migrated_count = row_count;

    insert into public.app_migration_markers (key, details)
    values (marker_key, jsonb_build_object('migrated_role_count', migrated_count));
  end if;
end $$;

create or replace function public.account_id_from_tenant(tenant_id text)
returns uuid
language plpgsql
stable
as $$
begin
  if tenant_id is null or tenant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return tenant_id::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.is_active_account_member(account_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, basejump
as $$
  select coalesce(exists (
    select 1
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.user_id = auth.uid()
      and memberships.account_id = is_active_account_member.account_id
      and accounts.status = 'active'
  ), false);
$$;

grant execute on function public.is_active_account_member(uuid) to authenticated, service_role;
grant execute on function public.account_id_from_tenant(text) to authenticated, service_role;

create or replace function public.account_user_ids(account_id uuid)
returns table (user_id uuid)
language sql
security definer
stable
set search_path = public, basejump
as $$
  select memberships.user_id
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  where memberships.account_id = account_user_ids.account_id
    and accounts.status = 'active'
    and (
      current_user in ('postgres', 'service_role', 'supabase_admin')
      or current_setting('request.jwt.claim.role', true) = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' = 'service_role'
      or exists (
        select 1
        from basejump.account_user caller_membership
        where caller_membership.account_id = account_user_ids.account_id
          and caller_membership.user_id = auth.uid()
      )
    )
  order by memberships.created_at, memberships.user_id;
$$;

grant execute on function public.account_user_ids(uuid) to authenticated, service_role;

create or replace function public.current_user_permission_codes(account_id uuid)
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
    and (user_roles.account_id is null or user_roles.account_id = $1)
    and roles.status = 'active'
    and permissions.status = 'active';
$$;

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
    and user_roles.account_id is null
    and roles.status = 'active'
    and permissions.status = 'active';
$$;

grant execute on function public.current_user_permission_codes(uuid) to authenticated;
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
        and user_roles.account_id is null
        and roles.status = 'active'
        and permissions.status = 'active'
        and permissions.code = has_app_permission.permission_code
    ),
    false
  );
$$;

grant execute on function public.has_app_permission(text) to authenticated, service_role;

create or replace function public.has_account_permission(account_id uuid, permission_code text)
returns boolean
language sql
security definer
stable
set search_path = public, basejump
as $$
  select public.is_active_account_member(has_account_permission.account_id)
    and (
      exists (
        select 1 from public.users
        where users.id = auth.uid() and users.role = 'admin'
      )
      or exists (
        select 1
        from public.admin_user_roles user_roles
        join public.admin_roles roles on roles.id = user_roles.role_id
        join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
        join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
        where user_roles.user_id = auth.uid()
          and (user_roles.account_id is null or user_roles.account_id = has_account_permission.account_id)
          and roles.status = 'active'
          and permissions.status = 'active'
          and permissions.code = has_account_permission.permission_code
      )
    );
$$;

grant execute on function public.has_account_permission(uuid, text) to authenticated, service_role;

create or replace function public.get_accounts()
returns json
language sql
stable
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'account_id', memberships.account_id,
        'account_role', memberships.account_role,
        'is_primary_owner', accounts.primary_owner_user_id = auth.uid(),
        'name', accounts.name,
        'slug', accounts.slug,
        'personal_account', accounts.personal_account,
        'code', accounts.code,
        'status', accounts.status,
        'base_currency', accounts.base_currency,
        'timezone', accounts.timezone,
        'fiscal_year_start_month', accounts.fiscal_year_start_month,
        'is_default', preferences.default_account_id = accounts.id,
        'is_last_used', preferences.last_account_id = accounts.id,
        'last_login_at', preferences.last_login_at,
        'metadata', accounts.public_metadata,
        'created_at', accounts.created_at,
        'updated_at', accounts.updated_at
      )
      order by
        (preferences.last_account_id = accounts.id) desc nulls last,
        accounts.personal_account asc,
        accounts.code asc
    ),
    '[]'::json
  )
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  left join public.account_user_preferences preferences on preferences.user_id = auth.uid()
  where memberships.user_id = auth.uid()
    and accounts.personal_account = false;
$$;

grant execute on function public.get_accounts() to authenticated;

create or replace function public.get_login_account_options(login_user_id uuid)
returns json
language sql
security definer
stable
set search_path = public, basejump
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'account_id', accounts.id,
        'code', accounts.code,
        'name', accounts.name,
        'base_currency', accounts.base_currency
      )
      order by accounts.code asc, accounts.name asc
    ),
    '[]'::json
  )
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  where memberships.user_id = get_login_account_options.login_user_id
    and accounts.personal_account = false
    and accounts.status = 'active';
$$;

revoke all on function public.get_login_account_options(uuid) from public, anon, authenticated;
grant execute on function public.get_login_account_options(uuid) to service_role;

create or replace function public.select_account_set_with_preference(account_id uuid, set_default boolean)
returns json
language plpgsql
security definer
set search_path = public, basejump
as $$
declare
  selected json;
begin
  if not public.is_active_account_member(select_account_set_with_preference.account_id) then
    raise exception 'Account set is unavailable or membership is missing';
  end if;

  insert into public.account_user_preferences (
    user_id, default_account_id, last_account_id, last_login_at, updated_at
  ) values (
    auth.uid(),
    case when coalesce(select_account_set_with_preference.set_default, false)
      then select_account_set_with_preference.account_id
      else null
    end,
    select_account_set_with_preference.account_id,
    timezone('utc'::text, now()), timezone('utc'::text, now())
  )
  on conflict (user_id) do update set
    default_account_id = case when coalesce(select_account_set_with_preference.set_default, false)
      then excluded.last_account_id
      else account_user_preferences.default_account_id
    end,
    last_account_id = excluded.last_account_id,
    last_login_at = excluded.last_login_at,
    updated_at = excluded.updated_at;

  insert into public.account_login_events (user_id, account_id)
  values (auth.uid(), select_account_set_with_preference.account_id);

  select public.get_account(select_account_set_with_preference.account_id) into selected;
  return selected;
end;
$$;

create or replace function public.select_account_set(account_id uuid)
returns json
language sql
security definer
set search_path = public, basejump
as $$
  select public.select_account_set_with_preference(select_account_set.account_id, false);
$$;

grant execute on function public.select_account_set_with_preference(uuid, boolean) to authenticated;
grant execute on function public.select_account_set(uuid) to authenticated;

create or replace function public.is_account_user(account_id uuid, user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, basejump
as $$
  select exists (
    select 1
    from public.account_user_ids(is_account_user.account_id) memberships
    where memberships.user_id = is_account_user.user_id
  );
$$;

grant execute on function public.is_account_user(uuid, uuid) to authenticated, service_role;

drop policy if exists "Permission holders can manage user roles" on public.admin_user_roles;
drop policy if exists "Admin users can manage user roles" on public.admin_user_roles;
drop policy if exists "Account permission holders can read user roles" on public.admin_user_roles;
drop policy if exists "Account permission holders can insert user roles" on public.admin_user_roles;
drop policy if exists "Account permission holders can update user roles" on public.admin_user_roles;
drop policy if exists "Account permission holders can delete user roles" on public.admin_user_roles;

create policy "Account permission holders can read user roles"
on public.admin_user_roles for select to authenticated
using (
  (account_id is null and public.has_app_permission('admin.users.manage'))
  or (
    account_id is not null
    and public.has_account_permission(account_id, 'admin.users.manage')
  )
);

create policy "Account permission holders can insert user roles"
on public.admin_user_roles for insert to authenticated
with check (
  (account_id is null and public.has_app_permission('admin.users.manage'))
  or (
    account_id is not null
    and public.has_account_permission(account_id, 'admin.users.manage')
    and public.is_account_user(account_id, user_id)
  )
);

create policy "Account permission holders can update user roles"
on public.admin_user_roles for update to authenticated
using (
  (account_id is null and public.has_app_permission('admin.users.manage'))
  or (
    account_id is not null
    and public.has_account_permission(account_id, 'admin.users.manage')
  )
)
with check (
  (account_id is null and public.has_app_permission('admin.users.manage'))
  or (
    account_id is not null
    and public.has_account_permission(account_id, 'admin.users.manage')
    and public.is_account_user(account_id, user_id)
  )
);

create policy "Account permission holders can delete user roles"
on public.admin_user_roles for delete to authenticated
using (
  (account_id is null and public.has_app_permission('admin.users.manage'))
  or (
    account_id is not null
    and public.has_account_permission(account_id, 'admin.users.manage')
  )
);

do $$
declare
  default_account_id constant uuid := '00000000-0000-4000-8000-000000000001';
  table_name text;
  tenant_tables text[] := array[
    'notification_events', 'notification_messages', 'notification_deliveries',
    'notification_preferences', 'chat_conversations', 'chat_conversation_members',
    'chat_messages', 'chat_message_reads', 'chat_message_reactions', 'print_logs',
    'wf_model', 'wf_process_definition', 'wf_process_instance', 'wf_task',
    'wf_history_event', 'wf_document_binding', 'wf_comment', 'wf_cc',
    'wf_job', 'wf_job_run', 'wf_timer_job'
  ];
begin
  if exists (select 1 from basejump.accounts where id = default_account_id) then
    foreach table_name in array tenant_tables loop
      if to_regclass('public.' || table_name) is not null then
        execute format(
          'update public.%I set tenant_id = $1 where tenant_id = ''default''',
          table_name
        ) using default_account_id::text;
      end if;
    end loop;
  end if;
end $$;

-- Workflow RLS follows parent tenant ownership for tables without tenant_id.
do $$
declare
  workflow_table text;
begin
  foreach workflow_table in array array[
    'wf_model', 'wf_process_definition', 'wf_process_instance', 'wf_task',
    'wf_history_event', 'wf_document_binding', 'wf_comment', 'wf_cc',
    'wf_job', 'wf_job_run', 'wf_timer_job'
  ]
  loop
    if to_regclass('public.' || workflow_table) is not null then
      execute format('drop policy if exists "Admin users can manage workflow models" on public.%I', workflow_table);
      execute format('drop policy if exists "Admin users can manage workflow definitions" on public.%I', workflow_table);
      execute format('drop policy if exists "Admin users can manage workflow runtime" on public.%I', workflow_table);
      execute format('drop policy if exists "Admin users can manage workflow task center" on public.%I', workflow_table);
      execute format('drop policy if exists "Admin users can manage workflow jobs" on public.%I', workflow_table);
      execute format('drop policy if exists "Permission holders can manage workflow definitions" on public.%I', workflow_table);
      execute format('drop policy if exists "Permission holders can manage workflow runtime" on public.%I', workflow_table);
      execute format('drop policy if exists "Permission holders can manage workflow task center" on public.%I', workflow_table);
      execute format('drop policy if exists "Account permission holders can manage workflow rows" on public.%I', workflow_table);
      execute format(
        'create policy "Account permission holders can manage workflow rows" on public.%I
          for all to authenticated
          using (
            public.has_account_permission(
              public.account_id_from_tenant(tenant_id),
              case
                when %L in (''wf_model'', ''wf_process_definition'') then ''workflow.definitions.manage''
                when %L in (''wf_comment'', ''wf_cc'') then ''workflow.tasks.manage''
                else ''workflow.runtime.manage''
              end
            )
          )
          with check (
            public.has_account_permission(
              public.account_id_from_tenant(tenant_id),
              case
                when %L in (''wf_model'', ''wf_process_definition'') then ''workflow.definitions.manage''
                when %L in (''wf_comment'', ''wf_cc'') then ''workflow.tasks.manage''
                else ''workflow.runtime.manage''
              end
            )
          )',
        workflow_table,
        workflow_table,
        workflow_table,
        workflow_table,
        workflow_table
      );
    end if;
  end loop;
end $$;

drop policy if exists "Permission holders can manage workflow definitions" on public.wf_model_version;
drop policy if exists "Admin users can manage workflow model versions" on public.wf_model_version;
drop policy if exists "Account permission holders can manage workflow model versions" on public.wf_model_version;
create policy "Account permission holders can manage workflow model versions"
on public.wf_model_version for all to authenticated
using (
  exists (
    select 1 from public.wf_model models
    where models.id = wf_model_version.model_id
      and public.has_account_permission(
        public.account_id_from_tenant(models.tenant_id),
        'workflow.definitions.manage'
      )
  )
)
with check (
  exists (
    select 1 from public.wf_model models
    where models.id = wf_model_version.model_id
      and public.has_account_permission(
        public.account_id_from_tenant(models.tenant_id),
        'workflow.definitions.manage'
      )
  )
);

do $$
declare
  definition_table text;
begin
  foreach definition_table in array array['wf_node_definition', 'wf_edge_definition']
  loop
    execute format('drop policy if exists "Permission holders can manage workflow definitions" on public.%I', definition_table);
    execute format('drop policy if exists "Admin users can manage workflow node definitions" on public.%I', definition_table);
    execute format('drop policy if exists "Admin users can manage workflow edge definitions" on public.%I', definition_table);
    execute format('drop policy if exists "Account permission holders can manage workflow definitions" on public.%I', definition_table);
    execute format(
      'create policy "Account permission holders can manage workflow definitions" on public.%I
        for all to authenticated
        using (
          exists (
            select 1 from public.wf_process_definition definitions
            where definitions.id = %I.definition_id
              and public.has_account_permission(
                public.account_id_from_tenant(definitions.tenant_id),
                ''workflow.definitions.manage''
              )
          )
        )
        with check (
          exists (
            select 1 from public.wf_process_definition definitions
            where definitions.id = %I.definition_id
              and public.has_account_permission(
                public.account_id_from_tenant(definitions.tenant_id),
                ''workflow.definitions.manage''
              )
          )
        )',
      definition_table,
      definition_table,
      definition_table
    );
  end loop;
end $$;

do $$
declare
  runtime_table text;
begin
  foreach runtime_table in array array[
    'wf_node_instance', 'wf_variable', 'wf_execution_token'
  ]
  loop
    execute format('drop policy if exists "Permission holders can manage workflow runtime" on public.%I', runtime_table);
    execute format('drop policy if exists "Admin users can manage workflow runtime" on public.%I', runtime_table);
    execute format('drop policy if exists "Account permission holders can manage workflow runtime" on public.%I', runtime_table);
    execute format(
      'create policy "Account permission holders can manage workflow runtime" on public.%I
        for all to authenticated
        using (
          exists (
            select 1
            from public.wf_process_instance instances
            where instances.id = %I.%I
              and public.has_account_permission(
                public.account_id_from_tenant(instances.tenant_id),
                ''workflow.runtime.manage''
              )
          )
        )
        with check (
          exists (
            select 1
            from public.wf_process_instance instances
            where instances.id = %I.%I
              and public.has_account_permission(
                public.account_id_from_tenant(instances.tenant_id),
                ''workflow.runtime.manage''
              )
          )
        )',
      runtime_table,
      runtime_table,
      'process_instance_id',
      runtime_table,
      'process_instance_id'
    );
  end loop;
end $$;

drop policy if exists "Permission holders can manage workflow runtime" on public.wf_task_candidate;
drop policy if exists "Admin users can manage workflow runtime" on public.wf_task_candidate;
drop policy if exists "Account permission holders can manage workflow runtime" on public.wf_task_candidate;
create policy "Account permission holders can manage workflow runtime"
on public.wf_task_candidate for all to authenticated
using (
  exists (
    select 1
    from public.wf_task tasks
    where tasks.id = wf_task_candidate.task_id
      and public.has_account_permission(
        public.account_id_from_tenant(tasks.tenant_id),
        'workflow.runtime.manage'
      )
  )
)
with check (
  exists (
    select 1
    from public.wf_task tasks
    where tasks.id = wf_task_candidate.task_id
      and public.has_account_permission(
        public.account_id_from_tenant(tasks.tenant_id),
        'workflow.runtime.manage'
      )
  )
);

-- Sales orders require membership first; account permission never bypasses membership.
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
drop policy if exists "Account members can read sales orders" on public.sales_orders;
create policy "Account members can read sales orders"
on public.sales_orders for select to authenticated
using (public.is_active_account_member(account_id));

drop policy if exists "Account owners can manage sales orders" on public.sales_orders;
create policy "Account owners can manage sales orders"
on public.sales_orders for all to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    basejump.has_role_on_account(account_id, 'owner')
    or public.has_account_permission(account_id, 'sales.orders.manage')
  )
)
with check (
  public.is_active_account_member(account_id)
  and (
    basejump.has_role_on_account(account_id, 'owner')
    or public.has_account_permission(account_id, 'sales.orders.manage')
  )
);

drop policy if exists "Account members can read sales order lines" on public.sales_order_lines;
create policy "Account members can read sales order lines"
on public.sales_order_lines for select to authenticated
using (public.is_active_account_member(account_id));

drop policy if exists "Account owners can manage sales order lines" on public.sales_order_lines;
create policy "Account owners can manage sales order lines"
on public.sales_order_lines for all to authenticated
using (
  public.is_active_account_member(account_id)
  and (
    basejump.has_role_on_account(account_id, 'owner')
    or public.has_account_permission(account_id, 'sales.orders.manage')
  )
)
with check (
  public.is_active_account_member(account_id)
  and (
    basejump.has_role_on_account(account_id, 'owner')
    or public.has_account_permission(account_id, 'sales.orders.manage')
  )
);

-- Notification policies bind every business row to an active account membership.
alter table public.notification_events enable row level security;
alter table public.notification_messages enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
drop policy if exists "Users can read own notification messages" on public.notification_messages;
drop policy if exists "Users can update own notification read state" on public.notification_messages;
drop policy if exists "Permission holders can manage notification messages" on public.notification_messages;
drop policy if exists "Account users can read notification messages" on public.notification_messages;
drop policy if exists "Account users can update notification messages" on public.notification_messages;
create policy "Account users can read notification messages"
on public.notification_messages for select to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage')
  )
);
create policy "Account users can update notification messages"
on public.notification_messages for update to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage')
  )
)
with check (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    recipient_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage')
  )
);

drop policy if exists "Users can manage own notification preferences" on public.notification_preferences;
drop policy if exists "Permission holders can manage notification preferences" on public.notification_preferences;
drop policy if exists "Account users can manage notification preferences" on public.notification_preferences;
create policy "Account users can manage notification preferences"
on public.notification_preferences for all to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    user_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage')
  )
)
with check (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    user_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage')
  )
);

drop policy if exists "Permission holders can manage notification events" on public.notification_events;
drop policy if exists "Account permission holders can manage notification events" on public.notification_events;
create policy "Account permission holders can manage notification events"
on public.notification_events for all to authenticated
using (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage'))
with check (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.messages.manage'));

drop policy if exists "Permission holders can manage notification deliveries" on public.notification_deliveries;
drop policy if exists "Account permission holders can manage notification deliveries" on public.notification_deliveries;
create policy "Account permission holders can manage notification deliveries"
on public.notification_deliveries for all to authenticated
using (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.deliveries.manage'))
with check (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'notification.deliveries.manage'));

-- Chat membership and chat permissions must belong to the same account set.
alter table public.chat_messages alter column session_id drop not null;
alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_message_reactions enable row level security;
drop policy if exists "Users can read joined chat conversations" on public.chat_conversations;
drop policy if exists "Permission holders can manage chat conversations" on public.chat_conversations;
drop policy if exists "Account users can read joined chat conversations" on public.chat_conversations;
drop policy if exists "Account permission holders can manage chat conversations" on public.chat_conversations;
drop policy if exists "Account users can create chat conversations" on public.chat_conversations;
drop policy if exists "Account users can update joined chat conversations" on public.chat_conversations;
create policy "Account users can read joined chat conversations"
on public.chat_conversations for select to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    exists (
      select 1 from public.chat_conversation_members members
      where members.conversation_id = chat_conversations.id
        and members.tenant_id = chat_conversations.tenant_id
        and members.user_id = auth.uid()
        and members.status = 'active'
    )
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'chat.manage')
  )
);
create policy "Account users can create chat conversations"
on public.chat_conversations for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
);
create policy "Account users can update joined chat conversations"
on public.chat_conversations for update to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_conversations.id
      and members.tenant_id = chat_conversations.tenant_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
)
with check (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_conversations.id
      and members.tenant_id = chat_conversations.tenant_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);
create policy "Account permission holders can manage chat conversations"
on public.chat_conversations for all to authenticated
using (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'chat.manage'))
with check (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'chat.manage'));

drop policy if exists "Users can read own chat memberships" on public.chat_conversation_members;
drop policy if exists "Account users can read chat memberships" on public.chat_conversation_members;
create policy "Account users can read chat memberships"
on public.chat_conversation_members for select to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    user_id = auth.uid()
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'chat.manage')
  )
);

drop policy if exists "Users can read joined chat messages" on public.chat_messages;
drop policy if exists "Chat participants can view messages" on public.chat_messages;
drop policy if exists "Chat participants can send messages" on public.chat_messages;
drop policy if exists "Account users can read joined chat messages" on public.chat_messages;
drop policy if exists "Account users can send joined chat messages" on public.chat_messages;
drop policy if exists "Account users can update own chat messages" on public.chat_messages;
create policy "Account users can read joined chat messages"
on public.chat_messages for select to authenticated
using (
  public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and (
    exists (
      select 1 from public.chat_conversation_members members
      where members.conversation_id = chat_messages.conversation_id
        and members.tenant_id = chat_messages.tenant_id
        and members.user_id = auth.uid()
        and members.status = 'active'
    )
    or public.has_account_permission(public.account_id_from_tenant(tenant_id), 'chat.manage')
  )
);
create policy "Account users can send joined chat messages"
on public.chat_messages for insert to authenticated
with check (
  conversation_id is not null
  and sender_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and exists (
    select 1
    from public.chat_conversations conversations
    join public.chat_conversation_members members
      on members.conversation_id = conversations.id
     and members.tenant_id = conversations.tenant_id
    where conversations.id = chat_messages.conversation_id
      and conversations.tenant_id = chat_messages.tenant_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);
create policy "Account users can update own chat messages"
on public.chat_messages for update to authenticated
using (
  sender_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_messages.conversation_id
      and members.tenant_id = chat_messages.tenant_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
)
with check (
  sender_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
  and exists (
    select 1 from public.chat_conversation_members members
    where members.conversation_id = chat_messages.conversation_id
      and members.tenant_id = chat_messages.tenant_id
      and members.user_id = auth.uid()
      and members.status = 'active'
  )
);

drop policy if exists "Users can manage own chat reads" on public.chat_message_reads;
drop policy if exists "Account users can manage own chat reads" on public.chat_message_reads;
create policy "Account users can manage own chat reads"
on public.chat_message_reads for all to authenticated
using (
  user_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
)
with check (
  user_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
);

drop policy if exists "Users can manage own chat reactions" on public.chat_message_reactions;
drop policy if exists "Account users can manage own chat reactions" on public.chat_message_reactions;
create policy "Account users can manage own chat reactions"
on public.chat_message_reactions for all to authenticated
using (
  user_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
)
with check (
  user_id = auth.uid()
  and public.is_active_account_member(public.account_id_from_tenant(tenant_id))
);

drop policy if exists "Permission holders can view print logs" on public.print_logs;
drop policy if exists "Account permission holders can view print logs" on public.print_logs;
alter table public.print_logs enable row level security;
create policy "Account permission holders can view print logs"
on public.print_logs for select to authenticated
using (public.has_account_permission(public.account_id_from_tenant(tenant_id), 'print.logs.view'));

select pg_notify('pgrst', 'reload schema');
