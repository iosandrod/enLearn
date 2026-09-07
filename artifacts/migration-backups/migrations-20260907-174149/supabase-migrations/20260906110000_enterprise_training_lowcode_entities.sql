-- Replace the custom training page with database-only low-code entity pages.
-- Each training table gets one list/form interface and one menu item.
begin;

-- The first draft used a Vue material page.  Keep the old record out of the
-- runtime; all training screens below are rendered by the generic low-code
-- list/form/grid materials.
update public.lowcode_pages
set status = 'archived',
    updated_at = timezone('utc'::text, now())
where code = 'training-course-console';

delete from public.lowcode_materials
where material_kind = 'page' and code = 'training-course-console';

update public.admin_routes
set path = '/dashboard/training-legacy',
    visible = false,
    status = 'inactive',
    updated_at = timezone('utc'::text, now())
where code = 'training-course-console';

with training_root as (
  insert into public.admin_routes (
    code, title, path, parent_id, route_type, icon, page_code,
    visible, keep_alive, layout, status, sort_order, metadata
  )
  select
    'training-root', '培训管理', '/dashboard/training', parent.id, 'group',
    'ri-graduation-cap-line', null, true, true, 'dashboard', 'active', 70,
    '{"group":"business","module":"training","navigation":"sidebar","mobileNavigation":"sidebar"}'::jsonb
  from public.admin_routes parent
  where parent.code = 'business-root'
  on conflict (code) do update set
    title = excluded.title,
    path = excluded.path,
    parent_id = excluded.parent_id,
    route_type = excluded.route_type,
    icon = excluded.icon,
    visible = true,
    keep_alive = excluded.keep_alive,
    layout = excluded.layout,
    status = 'active',
    sort_order = excluded.sort_order,
    metadata = excluded.metadata,
    updated_at = timezone('utc'::text, now())
  returning id
), configs(code, route, title, description, table_name, icon, sort_order, columns, fields, initial_values) as (
  values
  (
    'training-courses-list', '/dashboard/training/courses', '培训课程',
    '维护企业培训课程及发布状态。', 'training_courses', 'ri-book-2-line', 10,
    '[{"field":"code","title":"课程编码","minWidth":160,"fixed":"left"},{"field":"title","title":"课程名称","minWidth":220},{"field":"description","title":"课程简介","minWidth":260,"showOverflow":"tooltip"},{"field":"status","title":"状态","width":110},{"field":"sort_order","title":"排序","width":90,"align":"right"},{"field":"updated_at","title":"更新时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]'::jsonb,
    '[{"field":"code","label":"课程编码","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入课程编码"}]},{"field":"title","label":"课程名称","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入课程名称"}]},{"field":"description","label":"课程简介","component":"vxe-textarea","span":4,"props":{"rows":3,"resize":"vertical"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"options":[{"label":"草稿","value":"draft"},{"label":"已发布","value":"published"},{"label":"已归档","value":"archived"}]},{"field":"sort_order","label":"排序","component":"vxe-input","span":2,"props":{"type":"number"}}]'::jsonb,
    '{"id":"","code":"","title":"","description":"","status":"draft","sort_order":0}'::jsonb
  ),
  (
    'training-chapters-list', '/dashboard/training/chapters', '培训章节',
    '维护课程章节、视频和 PPT 文件关联。文件请先通过文件管理上传，再绑定文件 ID。', 'training_chapters', 'ri-video-line', 20,
    '[{"field":"course_id","title":"课程 ID","minWidth":220},{"field":"title","title":"章节名称","minWidth":220},{"field":"description","title":"章节说明","minWidth":240,"showOverflow":"tooltip"},{"field":"sort_order","title":"排序","width":90,"align":"right"},{"field":"video_file_id","title":"视频文件 ID","minWidth":220},{"field":"ppt_file_id","title":"PPT 文件 ID","minWidth":220},{"field":"duration_seconds","title":"时长(秒)","width":110,"align":"right"},{"field":"status","title":"状态","width":110},{"title":"操作","width":150,"fixed":"right","slots":{"default":"actions"}}]'::jsonb,
    '[{"field":"course_id","label":"所属课程","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入课程 ID"}]},{"field":"title","label":"章节名称","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入章节名称"}]},{"field":"description","label":"章节说明","component":"vxe-textarea","span":4,"props":{"rows":3,"resize":"vertical"}},{"field":"sort_order","label":"排序","component":"vxe-input","span":2,"props":{"type":"number"}},{"field":"video_file_id","label":"视频文件 ID","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"从文件管理复制 UUID"}},{"field":"ppt_file_id","label":"PPT 文件 ID","component":"vxe-input","span":2,"props":{"clearable":true,"placeholder":"从文件管理复制 UUID"}},{"field":"duration_seconds","label":"时长(秒)","component":"vxe-input","span":2,"props":{"type":"number"}},{"field":"status","label":"状态","component":"vxe-select","span":2,"options":[{"label":"草稿","value":"draft"},{"label":"已发布","value":"published"},{"label":"已归档","value":"archived"}]}]'::jsonb,
    '{"id":"","course_id":"","title":"","description":"","sort_order":0,"video_file_id":"","ppt_file_id":"","duration_seconds":0,"status":"published"}'::jsonb
  ),
  (
    'training-progress-list', '/dashboard/training/progress', '学习进度',
    '查看员工章节学习进度和完成状态。', 'training_progress', 'ri-bar-chart-2-line', 30,
    '[{"field":"course_id","title":"课程 ID","minWidth":220},{"field":"chapter_id","title":"章节 ID","minWidth":220},{"field":"user_id","title":"员工 ID","minWidth":220},{"field":"progress_seconds","title":"已学习(秒)","width":120,"align":"right"},{"field":"completed","title":"已完成","width":100,"align":"center"},{"field":"last_viewed_at","title":"最近学习时间","width":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]'::jsonb,
    '[{"field":"course_id","label":"课程 ID","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入课程 ID"}]},{"field":"chapter_id","label":"章节 ID","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入章节 ID"}]},{"field":"user_id","label":"员工 ID","component":"vxe-input","span":2,"props":{"clearable":true},"rules":[{"required":true,"message":"请输入员工 ID"}]},{"field":"progress_seconds","label":"已学习(秒)","component":"vxe-input","span":2,"props":{"type":"number"}},{"field":"completed","label":"已完成","component":"vxe-switch","span":2}]'::jsonb,
    '{"id":"","course_id":"","chapter_id":"","user_id":"","progress_seconds":0,"completed":false}'::jsonb
  )
), pages as (
  insert into public.lowcode_pages (
    code, route, title, description, page_type, layout, status, keep_alive, schema, version, published_at
  )
  select
    c.code, c.route, c.title, c.description, 'list', 'dashboard', 'published', true,
    jsonb_build_object(
      'schemaVersion', 1, 'code', c.code, 'route', c.route, 'title', c.title,
      'description', c.description, 'pageType', 'list', 'layout', 'dashboard',
      'status', 'published', 'keepAlive', true,
      'dataSources', jsonb_build_object(
        c.table_name || 'Rows', jsonb_build_object(
          'key', c.table_name || 'Rows', 'label', c.title,
          'serviceName', 'admin', 'serviceMethod', 'listItems',
          'saveMethod', 'saveItem', 'deleteMethod', 'deleteItem',
          'tableName', c.table_name,
          'postData', jsonb_build_object('tableName', c.table_name, 'limit', 500, 'orderBy', 'created_at', 'orderDirection', 'desc'),
          'autoLoad', true
        )
      ),
      'blocks', jsonb_build_array(
        jsonb_build_object('id', c.table_name || '-actions', 'kind', 'buttonGroup', 'align', 'left', 'gap', 8, 'actions', jsonb_build_array(
          jsonb_build_object('code','refresh','label','刷新','icon','ri-refresh-line','directives',jsonb_build_array(jsonb_build_object('type','refreshDataSource','sourceKeys',jsonb_build_array(c.table_name || 'Rows')))),
          jsonb_build_object('code','open-files','label','打开文件管理','icon','ri-folder-upload-line','route','/dashboard/files')
        )),
        jsonb_build_object(
          'id', c.table_name || '-grid', 'kind', 'grid', 'title', c.title,
          'sourceKey', c.table_name || 'Rows', 'editorBlockId', c.table_name || '-form',
          'deleteSourceKey', c.table_name || 'Rows',
          'schema', jsonb_build_object('grid', jsonb_build_object('border',true,'stripe',true,'showOverflow','tooltip','height',480,'rowConfig',jsonb_build_object('keyField','id','isCurrent',true),'columnConfig',jsonb_build_object('resizable',true),'columns',c.columns),'rowActions',jsonb_build_object('edit',true,'editLabel','编辑','delete',c.table_name <> 'training_progress','deleteLabel','删除'))
        ),
        jsonb_build_object(
          'id', c.table_name || '-form', 'kind', 'form', 'title', c.title || '编辑',
          'sourceKey', c.table_name || 'Rows', 'submitSourceKey', c.table_name || 'Rows',
          'initialValues', c.initial_values,
          'schema', jsonb_build_object('columns',4,'fields',c.fields,'actions',jsonb_build_array(jsonb_build_object('code','submit','label','保存','type','submit','status','primary'),jsonb_build_object('code','reset','label','重置','type','reset')))
        )
      )
    ),
    1, timezone('utc'::text, now())
  from configs c
  on conflict (code) do update set
    route = excluded.route, title = excluded.title, description = excluded.description,
    page_type = excluded.page_type, layout = excluded.layout, status = excluded.status,
    keep_alive = excluded.keep_alive, schema = excluded.schema,
    version = public.lowcode_pages.version + 1,
    published_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
  returning code
)
insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description, primary_key, status, sort_order, schema
)
select c.table_name, c.title, 'public.' || c.table_name, c.route, c.code, c.icon, c.description, 'id', 'active', c.sort_order,
       jsonb_build_object('sourceTable', c.table_name, 'service', 'admin', 'listMethod', 'listItems', 'saveMethod', 'saveItem', 'deleteMethod', 'deleteItem')
from (values
  ('training-courses-list','培训课程','/dashboard/training/courses','培训课程及发布状态。','training_courses','ri-book-2-line',10),
  ('training-chapters-list','培训章节','/dashboard/training/chapters','课程章节、视频和 PPT 文件关联。','training_chapters','ri-video-line',20),
  ('training-progress-list','学习进度','/dashboard/training/progress','员工章节学习进度和完成状态。','training_progress','ri-bar-chart-2-line',30)
) c(code,title,route,description,table_name,icon,sort_order)
on conflict (code) do update set
  title = excluded.title, table_name = excluded.table_name, route_path = excluded.route_path,
  page_code = excluded.page_code, icon = excluded.icon, description = excluded.description,
  primary_key = excluded.primary_key, status = excluded.status, sort_order = excluded.sort_order,
  schema = excluded.schema, updated_at = timezone('utc'::text, now());

-- Keep relationship metadata in the entity registry so the generic designer
-- can discover the course/chapter/progress graph without frontend code.
update public.admin_entities
set schema = schema || '{"relations":[{"field":"course_id","targetTable":"public.training_courses","targetField":"id","type":"many-to-one"}]}'::jsonb,
    updated_at = timezone('utc'::text, now())
where code = 'training_chapters';

update public.admin_entities
set schema = schema || '{"relations":[{"field":"course_id","targetTable":"public.training_courses","targetField":"id","type":"many-to-one"},{"field":"chapter_id","targetTable":"public.training_chapters","targetField":"id","type":"many-to-one"},{"field":"user_id","targetTable":"auth.users","targetField":"id","type":"many-to-one"}]}'::jsonb,
    updated_at = timezone('utc'::text, now())
where code = 'training_progress';

-- Add the three entity routes below the database-configured training group.
insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, visible, keep_alive,
  layout, status, sort_order, metadata
)
select c.code, c.title, c.route, root.id, 'page', c.icon, c.code, true, true,
       'dashboard', 'active', c.sort_order,
       jsonb_build_object('group','training','module','training','entity',c.table_name,'navigation','sidebar','mobileNavigation','sidebar')
from public.admin_routes root
cross join (values
  ('training-courses-list','培训课程','/dashboard/training/courses','ri-book-2-line',10,'training_courses'),
  ('training-chapters-list','培训章节','/dashboard/training/chapters','ri-video-line',20,'training_chapters'),
  ('training-progress-list','学习进度','/dashboard/training/progress','ri-bar-chart-2-line',30,'training_progress')
) c(code,title,route,icon,sort_order,table_name)
where root.code = 'training-root'
on conflict (code) do update set
  title = excluded.title, path = excluded.path, parent_id = excluded.parent_id,
  route_type = excluded.route_type, icon = excluded.icon, page_code = excluded.page_code,
  visible = true, keep_alive = excluded.keep_alive, layout = excluded.layout,
  status = 'active', sort_order = excluded.sort_order, metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');
commit;
