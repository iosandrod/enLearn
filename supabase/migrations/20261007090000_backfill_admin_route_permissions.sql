begin;

-- Every page route participates in navigation authorization.  Keep the
-- permission records explicit so a page cannot silently become public just
-- because its route was created without a permission_code.
insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  route_path,
  page_code,
  status,
  sort_order
)
values
  (
    'dashboard.view',
    'View Dashboard',
    'Open the dashboard workbench.',
    'menu',
    'dashboard',
    'view',
    '/dashboard',
    null,
    'active',
    90
  ),
  (
    'admin.settings.manage',
    'Manage System Settings',
    'View and update system settings.',
    'menu',
    'system-settings',
    'manage',
    '/dashboard/system/settings',
    'system-settings',
    'active',
    91
  ),
  (
    'files.manage',
    'Manage Files',
    'View and manage stored files.',
    'menu',
    'files',
    'manage',
    '/dashboard/files',
    'file-management',
    'active',
    92
  ),
  (
    'training.courses.view',
    'View Training Courses',
    'View training courses.',
    'menu',
    'training_courses',
    'view',
    '/dashboard/training/courses',
    'training-courses-list',
    'active',
    93
  ),
  (
    'training.courses.manage',
    'Manage Training Courses',
    'Create and maintain training courses.',
    'menu',
    'training_courses',
    'manage',
    '/dashboard/training/courses/edit',
    'training-courses-list-edit',
    'active',
    94
  ),
  (
    'training.chapters.view',
    'View Training Chapters',
    'View training chapters.',
    'menu',
    'training_chapters',
    'view',
    '/dashboard/training/chapters',
    'training-chapters-list',
    'active',
    95
  ),
  (
    'training.chapters.manage',
    'Manage Training Chapters',
    'Create and maintain training chapters.',
    'menu',
    'training_chapters',
    'manage',
    '/dashboard/training/chapters/edit',
    'training-chapters-list-edit',
    'active',
    96
  ),
  (
    'training.progress.view',
    'View Training Progress',
    'View learner training progress.',
    'menu',
    'training_progress',
    'view',
    '/dashboard/training/progress',
    'training-progress-list',
    'active',
    97
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  status = excluded.status,
  sort_order = excluded.sort_order;

-- Existing permissions are reused for the low-code metadata pages and the
-- notification center instead of introducing duplicate permission codes.
update public.admin_routes
set permission_code = case code
  when 'dashboard-home' then 'dashboard.view'
  when 'notification-message-center' then 'notification.messages.read'
  when 'training-courses-list' then 'training.courses.view'
  when 'training-courses-list-edit' then 'training.courses.manage'
  when 'training-chapters-list' then 'training.chapters.view'
  when 'training-chapters-list-edit' then 'training.chapters.manage'
  when 'training-progress-list' then 'training.progress.view'
  when 'form-definetion' then 'lowcode.pages.manage'
  when 'lowcode_function' then 'lowcode.pages.manage'
  when 'lowcode-page-runtime' then 'lowcode.pages.manage'
  when 'system-settings' then 'admin.settings.manage'
  when 'lowcode_material' then 'lowcode.pages.manage'
  when 'file-management' then 'files.manage'
  when 'training-course-console' then 'training.courses.manage'
  else permission_code
end,
updated_at = timezone('utc'::text, now())
where route_type = 'page'
  and permission_code is null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_routes'::regclass
      and conname = 'admin_routes_page_permission_code_check'
  ) then
    alter table public.admin_routes
      add constraint admin_routes_page_permission_code_check
      check (route_type <> 'page' or permission_code is not null);
  end if;
end;
$constraint$;

-- The built-in admin role should retain access to the newly protected pages.
insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code in (
    'dashboard.view',
    'admin.settings.manage',
    'files.manage',
    'training.courses.view',
    'training.courses.manage',
    'training.chapters.view',
    'training.chapters.manage',
    'training.progress.view'
  )
where roles.code = 'admin'
on conflict (role_id, permission_id) do nothing;

do $check$
begin
  if exists (
    select 1
    from public.admin_routes
    where route_type = 'page'
      and permission_code is null
  ) then
    raise exception 'Every page route must have a permission_code';
  end if;
end;
$check$;

commit;
