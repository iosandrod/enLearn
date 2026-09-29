begin;

alter table public.file_objects
  add column if not exists file_url text;

update public.service_resource_metadata
set config = jsonb_set(
  jsonb_set(
    config,
    '{create,allowedFields}',
    coalesce(config #> '{create,allowedFields}', '[]'::jsonb) ||
      case
        when coalesce(config #> '{create,allowedFields}', '[]'::jsonb) ? 'file_url'
          then '[]'::jsonb
        else '["file_url"]'::jsonb
      end,
    true
  ),
  '{update,allowedFields}',
  coalesce(config #> '{update,allowedFields}', '[]'::jsonb) ||
    case
      when coalesce(config #> '{update,allowedFields}', '[]'::jsonb) ? 'file_url'
        then '[]'::jsonb
      else '["file_url"]'::jsonb
    end,
  true
),
updated_at = now()
where service_name = 'files'
  and resource_name = 'file_objects';

select pg_notify('pgrst', 'reload schema');

commit;
