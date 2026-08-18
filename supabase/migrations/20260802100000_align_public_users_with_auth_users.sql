-- Keep public.users as the application profile table for Supabase Auth users.
-- The canonical user identity remains auth.users.id, and public.users.id mirrors it.

do $$
begin
  if to_regclass('public.users') is null then
    create table public.users (
      id uuid primary key references auth.users(id) on delete cascade,
      full_name text,
      avatar_url text,
      billing_address jsonb,
      payment_method jsonb,
      created_at timestamp with time zone default timezone('utc'::text, now()),
      updated_at timestamp with time zone default timezone('utc'::text, now())
    );
  end if;
end $$;

alter table public.users
  alter column id set not null;

do $$
declare
  constraint_name text;
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'p'
  ) then
    alter table public.users add constraint users_pkey primary key (id);
  end if;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'f'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.users'::regclass
            and attname = 'id'
        )
      ]::smallint[]
      and (
        confrelid <> 'auth.users'::regclass
        or confdeltype <> 'c'
      )
  loop
    execute format('alter table public.users drop constraint %I', constraint_name);
  end loop;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'f'
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'public.users'::regclass
            and attname = 'id'
        )
      ]::smallint[]
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
  ) then
    alter table public.users
      add constraint users_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.users enable row level security;

drop policy if exists "Can view own user data." on public.users;
create policy "Can view own user data."
on public.users
for select
using (auth.uid() = id);

drop policy if exists "Can update own user data." on public.users;
create policy "Can update own user data."
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    full_name = coalesce(public.users.full_name, excluded.full_name),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.users (id, full_name, avatar_url)
select
  auth_users.id,
  auth_users.raw_user_meta_data ->> 'full_name',
  auth_users.raw_user_meta_data ->> 'avatar_url'
from auth.users auth_users
where not exists (
  select 1
  from public.users profiles
  where profiles.id = auth_users.id
);

select pg_notify('pgrst', 'reload schema');
