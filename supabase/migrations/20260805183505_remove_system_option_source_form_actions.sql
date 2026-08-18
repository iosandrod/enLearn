-- Remove the form action bar from the system option-source edit page.

update public.lowcode_pages
set
  schema = jsonb_set(
    schema,
    '{blocks,1,tabs,0,blocks,0,schema,actions}',
    '[]'::jsonb,
    true
  ),
  version = version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where code = 'admin-system-options-edit';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'admin-system-options-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
