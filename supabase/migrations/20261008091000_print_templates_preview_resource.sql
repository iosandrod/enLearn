begin;

-- The generic admin CRUD layer filters writes through the resource metadata
-- allow-list before calling Supabase. Keep the new thumbnail column writable.
update public.service_resource_metadata
set config = jsonb_set(
  jsonb_set(
    config,
    '{create,allowedFields}',
    coalesce(config #> '{create,allowedFields}', '[]'::jsonb)
      || case
        when coalesce(config #> '{create,allowedFields}', '[]'::jsonb) @> '["preview"]'::jsonb
          then '[]'::jsonb
        else '["preview"]'::jsonb
      end,
    true
  ),
  '{update,allowedFields}',
  coalesce(config #> '{update,allowedFields}', '[]'::jsonb)
    || case
      when coalesce(config #> '{update,allowedFields}', '[]'::jsonb) @> '["preview"]'::jsonb
        then '[]'::jsonb
      else '["preview"]'::jsonb
    end,
  true
)
where service_name = 'admin'
  and resource_name = 'print_templates';

commit;
