begin;

-- Optionally associate a print template with an application user.
alter table public.print_templates
  add column if not exists user_id uuid;

comment on column public.print_templates.user_id is
  'Optional owner user for the print template.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.print_templates'::regclass
      and conname = 'print_templates_user_id_fkey'
  ) then
    alter table public.print_templates
      add constraint print_templates_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete set null;
  end if;
end
$$;

-- The generic admin CRUD layer filters writes through the resource metadata.
update public.service_resource_metadata
set config = jsonb_set(
  jsonb_set(
    config,
    '{create,allowedFields}',
    coalesce(config #> '{create,allowedFields}', '[]'::jsonb)
      || case
        when coalesce(config #> '{create,allowedFields}', '[]'::jsonb) @> '["user_id"]'::jsonb
          then '[]'::jsonb
        else '["user_id"]'::jsonb
      end,
    true
  ),
  '{update,allowedFields}',
  coalesce(config #> '{update,allowedFields}', '[]'::jsonb)
    || case
      when coalesce(config #> '{update,allowedFields}', '[]'::jsonb) @> '["user_id"]'::jsonb
        then '[]'::jsonb
      else '["user_id"]'::jsonb
    end,
  true
)
where service_name = 'admin'
  and resource_name = 'print_templates';

select pg_notify('pgrst', 'reload schema');

commit;
