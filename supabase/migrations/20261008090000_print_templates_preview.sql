begin;

alter table public.print_templates
  add column if not exists preview text;

comment on column public.print_templates.preview is
  'PNG data URL thumbnail generated from the print designer template.';

select pg_notify('pgrst', 'reload schema');

commit;
