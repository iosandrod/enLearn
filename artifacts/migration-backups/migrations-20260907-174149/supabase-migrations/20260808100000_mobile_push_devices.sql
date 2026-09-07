create table if not exists public.notification_push_devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  provider text,
  device_id text,
  app_version text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id, token)
);

create index if not exists idx_notification_push_devices_active
  on public.notification_push_devices (account_id, user_id, status, updated_at desc);

drop trigger if exists set_notification_push_devices_updated_at
  on public.notification_push_devices;
create trigger set_notification_push_devices_updated_at
before update on public.notification_push_devices
for each row execute function public.set_updated_at();

alter table public.notification_push_devices enable row level security;

drop policy if exists "Users can manage own push devices" on public.notification_push_devices;
create policy "Users can manage own push devices"
on public.notification_push_devices for all to authenticated
using (
  public.is_active_account_member(account_id)
  and user_id = auth.uid()
)
with check (
  public.is_active_account_member(account_id)
  and user_id = auth.uid()
);
