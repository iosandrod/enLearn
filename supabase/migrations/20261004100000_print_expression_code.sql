begin;

alter table public.print_expressions
  add column if not exists code text;

alter table public.print_expressions
  drop constraint if exists print_expressions_code_not_blank;
alter table public.print_expressions
  add constraint print_expressions_code_not_blank
  check (code is null or btrim(code) <> '');

create unique index if not exists uq_print_expressions_code
  on public.print_expressions (code)
  where code is not null;

update public.service_resource_metadata
set config = jsonb_set(
  jsonb_set(
    config,
    '{create,allowedFields}',
    '["name","code","description","purpose","template_id","template_type","expression_source","enabled"]'::jsonb,
    true
  ),
  '{update,allowedFields}',
  '["name","code","description","purpose","template_id","template_type","expression_source","enabled"]'::jsonb,
  true
),
updated_at = now()
where service_name = 'admin'
  and resource_name = 'print_expressions';

select pg_notify('pgrst', 'reload schema');

commit;
