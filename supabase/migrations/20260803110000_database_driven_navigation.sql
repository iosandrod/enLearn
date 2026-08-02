-- Declare dashboard navigation placement in admin_routes so the frontend can
-- render the database tree without code-based menu grouping or fallbacks.

update public.admin_routes
set
  metadata = coalesce(metadata, '{}'::jsonb) || case code
    when 'business-root' then '{"navigation":"container"}'::jsonb
    when 'dashboard-home' then '{"navigation":"hidden"}'::jsonb
    when 'lowcode-app-root' then '{"navigation":"sidebar"}'::jsonb
    when 'advanced-root' then '{"navigation":"top-tool"}'::jsonb
    when 'print-management-root' then '{"navigation":"sidebar"}'::jsonb
    when 'system-root' then '{"navigation":"hidden"}'::jsonb
    when 'sales-root' then '{"navigation":"sidebar"}'::jsonb
  end,
  updated_at = timezone('utc'::text, now())
where code in (
  'business-root',
  'dashboard-home',
  'lowcode-app-root',
  'advanced-root',
  'print-management-root',
  'system-root',
  'sales-root'
);

update public.admin_routes
set
  page_code = 'lowcode-pages',
  updated_at = timezone('utc'::text, now())
where code = 'lowcode-pages';

select pg_notify('pgrst', 'reload schema');
