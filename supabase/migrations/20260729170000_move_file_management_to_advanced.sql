-- Move file management under the advanced functions menu.

update public.admin_routes route
set
  parent_id = parent.id,
  sort_order = 60,
  metadata = coalesce(route.metadata, '{}'::jsonb) || '{"group":"advanced","category":"file"}'::jsonb,
  updated_at = timezone('utc'::text, now())
from public.admin_routes parent
where route.code = 'file-management'
  and parent.code = 'advanced-root';
