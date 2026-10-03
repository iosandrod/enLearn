begin;

alter table public.print_expressions
  add column if not exists description text,
  add column if not exists purpose text,
  add column if not exists template_id uuid references public.print_templates(id) on delete set null,
  add column if not exists template_type text;

create index if not exists idx_print_expressions_template_id
  on public.print_expressions (template_id);

update public.service_resource_metadata
set config = jsonb_set(
  jsonb_set(
    config,
    '{create,allowedFields}',
    '["name","description","purpose","template_id","template_type","expression_source","enabled"]'::jsonb,
    true
  ),
  '{update,allowedFields}',
  '["name","description","purpose","template_id","template_type","expression_source","enabled"]'::jsonb,
  true
),
updated_at = now()
where service_name = 'admin'
  and resource_name = 'print_expressions';

select pg_notify('pgrst', 'reload schema');

commit;
