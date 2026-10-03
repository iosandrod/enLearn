begin;

create table if not exists public.print_expressions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  purpose text,
  template_id uuid references public.print_templates(id) on delete set null,
  template_type text,
  expression_source text not null,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint print_expressions_name_not_blank check (btrim(name) <> ''),
  constraint print_expressions_source_not_blank check (btrim(expression_source) <> '')
);

create index if not exists idx_print_expressions_updated_at
  on public.print_expressions (updated_at desc);
create index if not exists idx_print_expressions_created_by
  on public.print_expressions (created_by, updated_at desc);
create index if not exists idx_print_expressions_template_id
  on public.print_expressions (template_id);

drop trigger if exists set_print_expressions_updated_at on public.print_expressions;
create trigger set_print_expressions_updated_at
before update on public.print_expressions
for each row execute function public.set_updated_at();

alter table public.print_expressions enable row level security;

drop policy if exists "Permission holders can manage print expressions"
  on public.print_expressions;
create policy "Permission holders can manage print expressions"
  on public.print_expressions for all
  using (public.has_app_permission('print.templates.manage'))
  with check (public.has_app_permission('print.templates.manage'));

grant select, insert, update, delete on public.print_expressions to authenticated;
grant all on public.print_expressions to service_role;

insert into public.service_resource_metadata (
  service_name,
  resource_name,
  table_name,
  version,
  config,
  enabled
)
values (
  'admin',
  'print_expressions',
  'print_expressions',
  1,
  jsonb_build_object(
    'tableName', 'print_expressions',
    'defaults', jsonb_build_object('enabled', true),
    'list', jsonb_build_object(
      'defaultPageSize', 100,
      'maxPageSize', 500,
      'defaultSorts', jsonb_build_array(
        jsonb_build_object('field', 'updated_at', 'direction', 'desc'),
        jsonb_build_object('field', 'created_at', 'direction', 'desc')
      )
    ),
    'create', jsonb_build_object(
      'allowedFields', jsonb_build_array('name', 'description', 'purpose', 'template_id', 'template_type', 'expression_source', 'enabled'),
      'requiredFields', jsonb_build_array('name', 'expression_source'),
      'userFields', jsonb_build_object(
        'createdBy', 'created_by',
        'updatedBy', 'updated_by'
      )
    ),
    'update', jsonb_build_object(
      'allowedFields', jsonb_build_array('name', 'description', 'purpose', 'template_id', 'template_type', 'expression_source', 'enabled'),
      'userFields', jsonb_build_object('updatedBy', 'updated_by')
    ),
    'delete', jsonb_build_object(),
    'permissions', jsonb_build_object(
      'list', 'print.templates.manage',
      'create', 'print.templates.manage',
      'update', 'print.templates.manage',
      'delete', 'print.templates.manage'
    )
  ),
  true
)
on conflict (service_name, resource_name) do update set
  table_name = excluded.table_name,
  version = excluded.version,
  config = excluded.config,
  enabled = excluded.enabled,
  updated_at = now();

select pg_notify('pgrst', 'reload schema');

commit;
