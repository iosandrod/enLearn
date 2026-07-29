-- Singleton system configuration for global application preferences.

create table if not exists public.system_config (
  singleton boolean primary key default true check (singleton),
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

insert into public.system_config (
  singleton,
  theme_mode,
  primary_color,
  language
) values (
  true,
  'system',
  '#2563eb',
  'zh-CN'
)
on conflict (singleton) do nothing;

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
      and policyname = 'Authenticated users can read system config'
  ) then
    create policy "Authenticated users can read system config"
      on public.system_config
      for select
      to authenticated
      using (true);
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
        singleton = true
        and exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;
end $$;

grant select on public.system_config to authenticated, service_role;
grant insert, update on public.system_config to authenticated, service_role;

create or replace function public.get_system_config()
returns jsonb
language sql
stable
as $$
  select to_jsonb(system_config)
  from public.system_config
  limit 1;
$$;

grant execute on function public.get_system_config() to authenticated, service_role;
