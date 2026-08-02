-- Persist print designer templates in PostgreSQL.

create table if not exists public.print_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  workspace jsonb not null default '{}'::jsonb
    check (jsonb_typeof(workspace) = 'object'),
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_print_templates_updated_at on public.print_templates;
create trigger set_print_templates_updated_at
before update on public.print_templates
for each row
execute function public.set_updated_at();

create index if not exists idx_print_templates_status_updated
  on public.print_templates (status, updated_at desc);

create index if not exists idx_print_templates_created_by
  on public.print_templates (created_by, updated_at desc);

alter table public.print_templates enable row level security;

grant select, insert, update, delete on public.print_templates
  to authenticated, service_role;

drop policy if exists "Permission holders can manage print templates"
  on public.print_templates;
create policy "Permission holders can manage print templates"
on public.print_templates
for all
to authenticated
using (public.has_app_permission('print.templates.manage'))
with check (public.has_app_permission('print.templates.manage'));

select pg_notify('pgrst', 'reload schema');
