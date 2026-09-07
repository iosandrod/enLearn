-- Use the complete Remix Icon class expected by the dashboard menu renderer.

update public.admin_routes
set
  icon = 'ri-database-2-line',
  updated_at = timezone('utc'::text, now())
where code = 'entity-design'
  and icon is distinct from 'ri-database-2-line';
