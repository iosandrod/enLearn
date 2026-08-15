-- Shared application profile fields and timestamp trigger support.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

alter table public.users
  add column if not exists phone text,
  add column if not exists nickname text,
  add column if not exists role text not null default 'user',
  add column if not exists updated_at timestamp with time zone
    default timezone('utc'::text, now());

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (role in ('user', 'admin'));

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();
