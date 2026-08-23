-- Keep low-code grid date/time rendering aligned with UTC API/database timestamps.

alter table public.system_config
  alter column locale_config set default '{
    "timezone": "UTC",
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "HH:mm:ss"
  }'::jsonb;

update public.system_config
set
  locale_config = jsonb_set(
    coalesce(locale_config, '{}'::jsonb),
    '{timezone}',
    to_jsonb('UTC'::text),
    true
  ),
  updated_at = timezone('utc'::text, now())
where coalesce(locale_config ->> 'timezone', '') <> 'UTC';

create or replace function public.create_default_system_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_config (
    user_id,
    locale_config,
    created_by,
    updated_by
  ) values (
    new.id,
    '{
      "timezone": "UTC",
      "dateFormat": "YYYY-MM-DD",
      "timeFormat": "HH:mm:ss"
    }'::jsonb,
    new.id,
    new.id
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

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
    locale_config,
    created_by,
    updated_by
  ) values (
    current_user_id,
    '{
      "timezone": "UTC",
      "dateFormat": "YYYY-MM-DD",
      "timeFormat": "HH:mm:ss"
    }'::jsonb,
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
