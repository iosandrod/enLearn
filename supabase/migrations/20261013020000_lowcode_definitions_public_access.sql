begin;

-- Configure both definition catalogs together using the existing access-level
-- installer, without recursively invoking its DDL event trigger.
select set_config('app.configuring_access_level', 'on', true);

alter table public.lowcode_pages
  add column if not exists access_level text not null default 'free';
alter table public.lowcode_form_definitions
  add column if not exists access_level text not null default 'free';

update public.lowcode_pages
  set access_level = 'free' where access_level is distinct from 'free';
update public.lowcode_form_definitions
  set access_level = 'free' where access_level is distinct from 'free';

alter table public.lowcode_pages
  alter column access_level set default 'free',
  alter column access_level set not null;
alter table public.lowcode_form_definitions
  alter column access_level set default 'free',
  alter column access_level set not null;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lowcode_pages'::regclass
      and conname = 'lowcode_pages_access_level_check'
  ) then
    alter table public.lowcode_pages
      add constraint lowcode_pages_access_level_check
      check (access_level in ('free', 'pro', 'enterprise'));
  end if;
end;
$constraint$;

-- Installs SELECT grants/RLS and enables publicRead + accessLevelRead for
-- every service resource registered against these tables.
select public.configure_access_level_resource('public.lowcode_pages'::regclass);
select public.configure_access_level_resource('public.lowcode_form_definitions'::regclass);

select set_config('app.configuring_access_level', 'off', true);
select pg_notify('pgrst', 'reload schema');

commit;
