begin;

alter table public.lowcode_form_definitions
  add column if not exists user_id uuid;

comment on column public.lowcode_form_definitions.user_id is
  '创建表单定义的用户；为空表示共享表单定义。';

-- Preserve shared definitions that have no recorded creator.
update public.lowcode_form_definitions definition
set user_id = definition.created_by
where definition.user_id is null
  and definition.created_by is not null
  and exists (select 1 from auth.users users where users.id = definition.created_by);

alter table public.lowcode_form_definitions
  alter column user_id set default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lowcode_form_definitions'::regclass
      and conname = 'lowcode_form_definitions_user_id_fkey'
  ) then
    alter table public.lowcode_form_definitions
      add constraint lowcode_form_definitions_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end
$$;

create index if not exists lowcode_form_definitions_user_id_idx
  on public.lowcode_form_definitions(user_id);

-- The generic CRUD layer sets user_id to the authenticated actor on create.
update public.service_resource_metadata
set config = jsonb_set(
  config,
  '{create,allowedFields}',
  coalesce(config #> '{create,allowedFields}', '[]'::jsonb)
    || case
      when coalesce(config #> '{create,allowedFields}', '[]'::jsonb) @> '["user_id"]'::jsonb
        then '[]'::jsonb
      else '["user_id"]'::jsonb
    end,
  true
)
where resource_name = 'lowcode_form_definitions'
  or config->>'tableName' in ('lowcode_form_definitions', 'public.lowcode_form_definitions');

select pg_notify('pgrst', 'reload schema');

commit;
