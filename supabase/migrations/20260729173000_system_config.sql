-- Per-user system configuration for global application preferences.

create table if not exists public.system_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_mode text not null default 'system'
    check (theme_mode in ('light', 'dark', 'system')),
  primary_color text not null default '#2563eb'
    check (btrim(primary_color) <> ''),
  theme_config jsonb not null default '{
    "colors": {
      "primary": "#2563eb",
      "success": "#16a34a",
      "warning": "#d97706",
      "danger": "#dc2626",
      "info": "#0891b2",
      "background": "#ffffff",
      "surface": "#f8fafc",
      "text": "#0f172a"
    },
    "radius": 6
  }'::jsonb
    check (jsonb_typeof(theme_config) = 'object'),
  table_config jsonb not null default '{
    "size": "medium",
    "stripe": true,
    "border": true,
    "showOverflow": "tooltip",
    "pageSize": 20,
    "pageSizes": [10, 20, 50, 100],
    "autoHeight": true
  }'::jsonb
    check (jsonb_typeof(table_config) = 'object'),
  language text not null default 'zh-CN'
    check (btrim(language) <> ''),
  locale_config jsonb not null default '{
    "timezone": "Asia/Shanghai",
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "HH:mm:ss"
  }'::jsonb
    check (jsonb_typeof(locale_config) = 'object'),
  feature_flags jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feature_flags) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index if not exists idx_system_config_user_id
  on public.system_config(user_id);

insert into public.system_config (
  user_id,
  created_by,
  updated_by
)
select
  auth_users.id,
  auth_users.id,
  auth_users.id
from auth.users auth_users
on conflict (user_id) do nothing;

drop trigger if exists set_system_config_updated_at on public.system_config;
create trigger set_system_config_updated_at
before update on public.system_config
for each row
execute function public.set_updated_at();

alter table public.system_config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_config'
      and policyname = 'Users can read own system config'
  ) then
    create policy "Users can read own system config"
      on public.system_config
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_config'
      and policyname = 'Users can insert own system config'
  ) then
    create policy "Users can insert own system config"
      on public.system_config
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_config'
      and policyname = 'Users can update own system config'
  ) then
    create policy "Users can update own system config"
      on public.system_config
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_config'
      and policyname = 'Admin users can manage system config'
  ) then
    create policy "Admin users can manage system config"
      on public.system_config
      for all
      to authenticated
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

grant select on public.system_config to authenticated, service_role;
grant insert, update, delete on public.system_config to authenticated, service_role;

create or replace function public.create_default_system_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_config (
    user_id,
    created_by,
    updated_by
  ) values (
    new.id,
    new.id,
    new.id
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_system_config on auth.users;
create trigger on_auth_user_created_system_config
after insert on auth.users
for each row execute procedure public.create_default_system_config();

create or replace function public.get_system_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  config jsonb;
begin
  if current_user_id is null then
    return null;
  end if;

  insert into public.system_config (
    user_id,
    created_by,
    updated_by
  ) values (
    current_user_id,
    current_user_id,
    current_user_id
  )
  on conflict (user_id) do nothing;

  select to_jsonb(system_config)
    into config
  from public.system_config
  where system_config.user_id = current_user_id
  limit 1;

  return config;
end;
$$;

grant execute on function public.get_system_config() to authenticated, service_role;
