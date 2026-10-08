begin;

alter table public.file_objects
  add column if not exists user_id uuid;

comment on column public.file_objects.user_id is
  '创建并上传文件的用户；与表示文件拥有者的 owner_id 区分。';

-- Existing uploads were created under the owner's users/<id>/ storage path.
update public.file_objects
set user_id = owner_id
where user_id is null;

alter table public.file_objects
  alter column user_id set default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.file_objects'::regclass
      and conname = 'file_objects_user_id_fkey'
  ) then
    alter table public.file_objects
      add constraint file_objects_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end
$$;

create index if not exists file_objects_user_id_idx
  on public.file_objects(user_id);

-- Uploads use database resource metadata when it is available.
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
  '{create,userFields}',
  coalesce(config #> '{create,userFields}', '{}'::jsonb)
    || '{"createdBy":"user_id"}'::jsonb,
  true
)
where service_name = 'files' and resource_name = 'file_objects';

select pg_notify('pgrst', 'reload schema');

commit;
